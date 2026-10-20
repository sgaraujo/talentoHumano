import { collection, collectionGroup, doc, getDoc, getDocs, query, setDoc, serverTimestamp, where } from 'firebase/firestore';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/config/firestoreCollections';
import { parseFirestoreDate } from '@/domain/humanResources/firestoreDate';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { questionnaireService } from '@/services/questionnaireService';
import type { Question, QuestionType } from '@/models/types/Questionnaire';

// Rutas espejo de functions/src/offboarding/offboarding.ts.
const SURVEYS_PATH = 'human_resources/data/offboarding_surveys';
const SETTINGS_REF = () => doc(db, 'human_resources/data/settings', 'offboarding');

export type OffboardingStatus = 'pending_send' | 'not_sent' | 'sent' | 'responded';

export interface OffboardingQuestionSnapshot {
  id: string; text: string; type: QuestionType; order: number;
  options?: Array<{ label: string; value: string }>;
}

export interface OffboardingSurvey {
  id: string;
  employeeId: string;
  employmentId: string;
  fullName: string;
  documentNumber: string;
  personalEmail: string | null;
  companyName: string | null;
  projectName: string | null;
  position: string | null;
  supervisor: string | null;
  endDate: string | null;
  terminationReason: string | null;
  questionnaireTitle: string;
  status: OffboardingStatus;
  notSentReason?: string | null;
  sendCount: number;
  createdAt: Date | null;
  sentAt: Date | null;
  lastSentAt: Date | null;
  respondedAt: Date | null;
  reminderCount: number;
  lastReminderAt: Date | null;
  lastReminderError?: string | null;
  answers?: Record<string, unknown>;
  questions?: OffboardingQuestionSnapshot[];
}

export interface OffboardingSettings {
  enabled: boolean;
  questionnaireId: string;
  maxRetirementAgeDays: number;
  excludedReasons: string[];
  /** Recordatorio automático diario (10 a. m.) a quien no ha respondido. */
  remindersEnabled: boolean;
  reminderIntervalDays: number;
  maxReminders: number;
}

export const DEFAULT_SETTINGS: OffboardingSettings = {
  enabled: false,
  questionnaireId: '',
  maxRetirementAgeDays: 30,
  excludedReasons: ['Fallecimiento', 'Anulado'],
  remindersEnabled: false,
  reminderIntervalDays: 5,
  maxReminders: 2,
};

const toDate = (value: any): Date | null => value?.toDate?.() ?? (value instanceof Date ? value : null);

export async function listOffboardingSurveys(): Promise<OffboardingSurvey[]> {
  const snap = await getDocs(collection(db, SURVEYS_PATH));
  return snap.docs.map(item => {
    const data = item.data() as any;
    return {
      ...data,
      id: item.id,
      sendCount: data.sendCount ?? 0,
      reminderCount: data.reminderCount ?? 0,
      createdAt: toDate(data.createdAt),
      sentAt: toDate(data.sentAt),
      lastSentAt: toDate(data.lastSentAt),
      lastReminderAt: toDate(data.lastReminderAt),
      respondedAt: toDate(data.respondedAt),
    } as OffboardingSurvey;
  }).sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''));
}

export async function getOffboardingSettings(): Promise<OffboardingSettings> {
  const snap = await getDoc(SETTINGS_REF());
  return { ...DEFAULT_SETTINGS, ...(snap.data() ?? {}) } as OffboardingSettings;
}

export async function saveOffboardingSettings(settings: OffboardingSettings, actor: string) {
  await setDoc(SETTINGS_REF(), { ...settings, updatedBy: actor, updatedAt: serverTimestamp() }, { merge: true });
}

export async function resendOffboardingSurvey(surveyId: string): Promise<string> {
  const call = httpsCallable<{ surveyId: string }, { ok: boolean; sentTo: string }>(functions, 'resendOffboardingSurvey');
  const result = await call({ surveyId });
  return result.data.sentTo;
}

// Espejo de ReminderOutcome en functions/src/offboarding/offboarding.ts.
export type ReminderOutcome =
  | 'sent' | 'responded' | 'not_pending' | 'recent' | 'max_reached' | 'rehired' | 'no_email' | 'error' | 'not_found';

/** Recordatorio con el mismo enlace a encuestas pendientes de respuesta (máximo 100 por llamada). */
export async function sendOffboardingReminders(surveyIds: string[]): Promise<Array<{ surveyId: string; outcome: ReminderOutcome }>> {
  const call = httpsCallable<{ surveyIds: string[] }, { results: Array<{ surveyId: string; outcome: ReminderOutcome }> }>(
    functions, 'sendOffboardingReminders', { timeout: 300_000 },
  );
  const result = await call({ surveyIds });
  return result.data.results;
}

// ── Encuesta sugerida ────────────────────────────────────────────────────────

const options = (labels: string[]) => labels.map((label, index) => ({ id: `op${index + 1}`, label, value: label }));
const q = (id: string, text: string, type: QuestionType, order: number, required = true, opts?: string[]): Question =>
  ({ id, text, type, order, required, ...(opts ? { options: options(opts) } : {}) });

export const OFFBOARDING_MOTIVES = [
  'Mejor oferta salarial',
  'Oportunidad de crecimiento en otra empresa',
  'Relación con el líder',
  'Clima laboral',
  'Carga de trabajo',
  'Horarios o modalidad de trabajo',
  'Motivos personales o familiares',
  'Estudios',
  'Cambio de ciudad',
  'Finalización del contrato o proyecto',
  'Otro',
];

/** Preguntas definidas por Talento Humano en la solicitud de Offboarding. */
export const SUGGESTED_OFFBOARDING_QUESTIONS: Question[] = [
  q('motivo_retiro', '¿Cuál fue el motivo principal de tu retiro?', 'select', 1, true, OFFBOARDING_MOTIVES),
  q('experiencia_general', 'Califica tu experiencia general en la empresa', 'rating', 2),
  q('experiencia_lider', 'Califica tu experiencia con tu líder', 'rating', 3),
  q('clima_laboral', 'Califica el ambiente y clima laboral', 'rating', 4),
  q('comunicacion', 'Califica la comunicación en la empresa', 'rating', 5),
  q('compensacion', 'Califica la compensación y los beneficios', 'rating', 6),
  q('crecimiento', 'Califica las oportunidades de crecimiento y desarrollo', 'rating', 7),
  q('bienestar', 'Califica las actividades y programas de bienestar', 'rating', 8),
  q('procesos', 'Califica los procesos internos', 'rating', 9),
  q('aspectos_positivos', '¿Qué aspectos positivos destacas de tu experiencia?', 'textarea', 10),
  q('aspectos_mejorar', '¿Qué aspectos consideras que deberían mejorarse?', 'textarea', 11),
  q('recomendacion', '¿Qué tanto recomendarías a INTEEGRADOS como lugar para trabajar?', 'rating', 12),
  q('comentarios', 'Comentarios o recomendaciones adicionales', 'textarea', 13, false),
];

export async function createSuggestedOffboardingQuestionnaire(actor: string): Promise<string> {
  return questionnaireService.create({
    title: 'Encuesta de salida – Offboarding',
    description: 'Gracias por tu paso por INTEEGRADOS. Tus respuestas nos ayudan a mejorar la experiencia de quienes trabajan con nosotros. Las calificaciones van de 1 (muy mala) a 5 (excelente).',
    questions: SUGGESTED_OFFBOARDING_QUESTIONS,
    targetRole: 'excolaborador',
    active: true,
    createdBy: actor,
  } as any);
}

// ── Envío manual a excolaboradores de Expedientes ────────────────────────────

export interface RetiredEmployee {
  employeeId: string;
  fullName: string;
  documentNumber: string;
  personalEmail: string | null;
  companyName: string | null;
  projectName: string | null;
  position: string | null;
  endDate: string | null;
  terminationReason: string | null;
  /** ID que tendría su encuesta (empleado + contrato del último retiro). */
  surveyId: string;
}

const endTime = (value: any): number => parseFirestoreDate(value)?.getTime() ?? 0;
const isoEnd = (value: any): string | null => {
  const date = parseFirestoreDate(value);
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : null;
};

/** Excolaboradores según Expedientes y control: sin contratos activos y con al menos un retiro. */
export async function listRetiredEmployees(): Promise<RetiredEmployee[]> {
  const [employeeSnap, employmentSnap] = await Promise.all([
    getDocs(query(collection(db, FIRESTORE_COLLECTIONS.employees), where('status', '==', 'retired'))),
    getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
  ]);
  const relations = new Map<string, any[]>();
  employmentSnap.docs.forEach(snapshot => {
    const value = { id: snapshot.id, ...snapshot.data() } as any;
    const employeeId = value.employeeId || snapshot.ref.parent.parent?.id;
    if (employeeId) relations.set(employeeId, [...(relations.get(employeeId) ?? []), value]);
  });
  return employeeSnap.docs.flatMap(snapshot => {
    const employee = snapshot.data() as any;
    const items = relations.get(snapshot.id) ?? [];
    if (items.some(item => item.status === 'active')) return [];
    const last = items.filter(item => item.status === 'retired').sort((a, b) => endTime(b.endDate) - endTime(a.endDate))[0];
    if (!last) return [];
    return [{
      employeeId: snapshot.id,
      fullName: employee.fullName || 'Sin nombre',
      documentNumber: employee.documentNumber || snapshot.id,
      personalEmail: employee.personalEmail || null,
      companyName: last.companyName ?? null,
      projectName: last.projectName || last.analyticalAccount || null,
      position: last.position ?? null,
      endDate: isoEnd(last.endDate),
      terminationReason: last.terminationReason ?? null,
      surveyId: `${snapshot.id}_${last.id}`,
    }];
  }).sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''));
}

export type ManualSendOutcome = 'created' | 'exists' | 'excluded' | 'old' | 'no_retirement' | 'still_active' | 'not_found';
export interface ManualSendResult { employeeId: string; outcome: ManualSendOutcome; sent?: boolean; detail?: string }

export async function sendOffboardingSurveysTo(employeeIds: string[]): Promise<ManualSendResult[]> {
  const call = httpsCallable<{ employeeIds: string[] }, { results: ManualSendResult[] }>(functions, 'sendOffboardingSurveys');
  const result = await call({ employeeIds });
  return result.data.results;
}
