import { defineSecret, defineString } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";

// Conexión compartida con Gemini: la usan el asistente del manual y el
// generador de cuestionarios.

export const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// Modelos configurables sin tocar código, en functions/.env.
const GEMINI_MODEL = defineString("GEMINI_MODEL", { default: "gemini-3.5-flash" });
// Respaldo cuando el principal está saturado (503) o sin cuota (429).
const GEMINI_FALLBACK_MODEL = defineString("GEMINI_FALLBACK_MODEL", { default: "gemini-3.6-flash" });

// Errores temporales de Gemini que vale la pena reintentar.
const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);
const RETRY_DELAYS_MS = [0, 1500];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GeminiError extends Error {
  constructor(readonly status: number, readonly model: string, readonly body: string) {
    super(`GEMINI_ERROR status=${status} model=${model}`);
  }
}

/** Modelo principal y de respaldo, sin repetir. */
export const geminiModels = () =>
  [...new Set([GEMINI_MODEL.value(), GEMINI_FALLBACK_MODEL.value()].filter(Boolean))];

/** true si el error es saturación o falta de cuota (mensaje "muy ocupado"). */
export const isBusyError = (err: unknown) =>
  err instanceof GeminiError && (err.status === 429 || err.status === 503);

/**
 * Llama a Gemini con reintentos: cada modelo se intenta hasta
 * RETRY_DELAYS_MS.length veces ante errores temporales y, si sigue fallando,
 * pasa al modelo de respaldo. Devuelve la respuesta y el modelo que respondió.
 */
export async function generateWithRetry(payload: unknown, models = geminiModels()): Promise<{ data: any; model: string }> {
  const apiKey = GEMINI_API_KEY.value();
  let lastError: GeminiError | null = null;
  for (const model of models) {
    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await sleep(delay);
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload),
      });
      if (resp.ok) return { data: await resp.json(), model };
      lastError = new GeminiError(resp.status, model, (await resp.text().catch(() => "")).slice(0, 1000));
      logger.warn("GEMINI_ATTEMPT_FAILED", { status: resp.status, model });
      // Un error no temporal (clave inválida, modelo inexistente) no mejora
      // reintentando el mismo modelo; se pasa directo al respaldo.
      if (!RETRYABLE_STATUS.has(resp.status)) break;
    }
  }
  throw lastError ?? new Error("GEMINI_NO_MODELS");
}

/** Texto de la primera respuesta candidata. */
export const replyText = (data: any): string =>
  (data?.candidates?.[0]?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();
