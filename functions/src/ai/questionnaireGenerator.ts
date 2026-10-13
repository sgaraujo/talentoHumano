import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GEMINI_API_KEY, GeminiError, generateWithRetry, isBusyError, replyText } from "./gemini";

// Genera un BORRADOR de cuestionario a partir de lo que describe Talento
// Humano. No guarda nada: el borrador vuelve al formulario de creación para
// que TH lo revise, edite y guarde.

const QUESTION_TYPES = ["text", "textarea", "select", "multiple", "rating", "date", "number"] as const;
type QuestionType = typeof QUESTION_TYPES[number];
const TARGETS = ["all", "colaborador", "aspirante", "excolaborador"] as const;

const MAX_PROMPT_CHARS = 2000;
const MAX_QUESTIONS = 40;
const GENERATIONS_PATH = "assistant/data/questionnaire_generations";

interface GeneratedQuestion { text: string; type: QuestionType; required: boolean; options: string[] }
interface GeneratedQuestionnaire { title: string; description: string; questions: GeneratedQuestion[] }

// Esquema que Gemini debe respetar (salida JSON estructurada).
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING" },
          type: { type: "STRING", enum: [...QUESTION_TYPES] },
          required: { type: "BOOLEAN" },
          options: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["text", "type", "required"],
      },
    },
  },
  required: ["title", "description", "questions"],
};

const TARGET_LABEL: Record<string, string> = {
  all: "todas las personas (colaboradores, aspirantes y excolaboradores)",
  colaborador: "colaboradores activos",
  aspirante: "aspirantes en proceso de selección",
  excolaborador: "excolaboradores (personas que ya salieron de la empresa)",
};

const SYSTEM_PROMPT = `Eres especialista en Talento Humano en Colombia y diseñas cuestionarios para INTEEGRADOS, un grupo empresarial de tecnología y servicios.

Tu tarea: a partir de la solicitud de Talento Humano, proponer un cuestionario listo para enviar.

Tipos de pregunta disponibles (usa exactamente estos valores en "type"):
- "text": respuesta corta (una línea).
- "textarea": respuesta abierta larga (opiniones, comentarios, sugerencias).
- "select": selección única. Requiere "options" con 2 a 8 opciones.
- "multiple": selección múltiple. Requiere "options" con 2 a 10 opciones.
- "rating": calificación de 1 a 5 estrellas (1 = muy malo, 5 = excelente). No lleva opciones. Úsala para medir satisfacción, acuerdo o percepción.
- "date": fecha.
- "number": número.

Reglas:
1. Escribe en español de Colombia, tono cercano y respetuoso, tuteando. Preguntas claras, una idea por pregunta, sin dobles negaciones.
2. Si la solicitud indica una cantidad de preguntas, respétala. Si no, propón entre 8 y 12.
3. Combina tipos: usa "rating" para percepciones, "select"/"multiple" para categorías y al menos una "textarea" para comentarios abiertos, salvo que la solicitud pida otra cosa.
4. En preguntas "rating", redacta el enunciado para que la escala de 1 a 5 tenga sentido (por ejemplo "Califica…" o "¿Qué tan satisfecho estás con…?").
5. En "select" y "multiple" incluye "Otro" cuando las opciones no cubran todos los casos.
6. Marca como obligatorias ("required": true) las preguntas centrales; los comentarios adicionales suelen ser opcionales.
7. Protección de datos (Ley 1581 de 2012): NO pidas datos sensibles (salud, religión, orientación sexual, afiliación política o sindical, origen étnico, datos biométricos) salvo que la solicitud lo pida explícitamente y tenga un fin laboral legítimo. Nunca pidas contraseñas ni datos bancarios.
8. No incluyas preguntas discriminatorias (edad, estado civil, embarazo, etc.) en cuestionarios de selección.
9. "title": nombre corto del cuestionario. "description": 1 a 3 frases que el destinatario verá al abrirlo, explicando para qué es y cuánto tarda.
10. Si la solicitud no es sobre un cuestionario o encuesta de Talento Humano, devuelve un cuestionario vacío con "title": "Solicitud no válida" y en "description" explica que solo puedes crear cuestionarios de Talento Humano.`;

const clean = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Valida y normaliza lo que devuelve el modelo. */
function sanitize(raw: any): GeneratedQuestionnaire {
  const questions: GeneratedQuestion[] = [];
  for (const item of Array.isArray(raw?.questions) ? raw.questions : []) {
    const text = clean(item?.text, 300);
    let type = (QUESTION_TYPES as readonly string[]).includes(item?.type) ? item.type as QuestionType : "text";
    if (!text) continue;
    let options = type === "select" || type === "multiple" ?
      [...new Set((Array.isArray(item?.options) ? item.options : []).map((o: unknown) => clean(o, 120)).filter(Boolean))] as string[] :
      [];
    // Una pregunta de opciones sin opciones suficientes no sirve: pasa a texto.
    if ((type === "select" || type === "multiple") && options.length < 2) {
      type = "text";
      options = [];
    }
    questions.push({ text, type, required: item?.required !== false, options: options.slice(0, 12) });
    if (questions.length >= MAX_QUESTIONS) break;
  }
  return { title: clean(raw?.title, 120), description: clean(raw?.description, 600), questions };
}

export const generateQuestionnaire = onCall(
  { region: "us-central1", secrets: [GEMINI_API_KEY], timeoutSeconds: 90 },
  async (request) => {
    const email = String(request.auth?.token.email ?? "").trim().toLowerCase();
    if (!email) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    const db = getFirestore();
    const role = (await db.collection("identity/data/platform_roles").doc(email).get()).data()?.role;
    if (role !== "admin" && role !== "talento_humano") {
      throw new HttpsError("permission-denied", "Solo Talento Humano puede generar cuestionarios con IA.");
    }

    const prompt = clean(request.data?.prompt, MAX_PROMPT_CHARS);
    if (prompt.length < 10) throw new HttpsError("invalid-argument", "Describe con un poco más de detalle el cuestionario que necesitas.");
    const target = (TARGETS as readonly string[]).includes(request.data?.targetRole) ? request.data.targetRole as string : "all";

    const userMessage = `Solicitud de Talento Humano:\n"""${prompt}"""\n\nDirigido a: ${TARGET_LABEL[target]}.`;

    let data: any;
    let model: string;
    try {
      ({ data, model } = await generateWithRetry({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }));
    } catch (err) {
      logger.error("QUESTIONNAIRE_GEMINI_ERROR", err instanceof GeminiError ? { status: err.status, model: err.model, body: err.body } : err);
      throw new HttpsError(
        "unavailable",
        isBusyError(err) ?
          "La IA está muy ocupada en este momento. Intenta de nuevo en un minuto." :
          "No se pudo generar el cuestionario en este momento.",
      );
    }

    let draft: GeneratedQuestionnaire;
    try {
      draft = sanitize(JSON.parse(replyText(data)));
    } catch (err) {
      logger.error("QUESTIONNAIRE_PARSE_ERROR", { model, err: String(err), text: replyText(data).slice(0, 500) });
      throw new HttpsError("internal", "La IA devolvió una respuesta incompleta. Intenta de nuevo.");
    }

    if (!draft.questions.length) {
      throw new HttpsError("failed-precondition", draft.description || "No se pudo proponer preguntas para esa solicitud. Intenta describirla de otra forma.");
    }

    // Registro para conocer el uso (quién, qué pidió y cuántas preguntas salieron).
    await db.collection(GENERATIONS_PATH).add({
      email, prompt, targetRole: target, model, title: draft.title,
      questionCount: draft.questions.length, createdAt: FieldValue.serverTimestamp(),
    }).catch((err) => logger.error("QUESTIONNAIRE_LOG_ERROR", err));

    return draft;
  },
);
