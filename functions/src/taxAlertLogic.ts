export interface PreviousAlertSnapshot {
  obligationId?: string;
  recipientEmails?: string[];
  company?: string;
  nit?: string;
  taxType?: string;
  period?: string;
  dueDate?: string;
  status?: string;
}

const PERIOD_MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const normalizePeriodText = (value = "") => value.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[.\-,()]/g, " ")
  .replace(/\s+/g, " ").trim();

/** Identidad semántica estable para comparar variantes legacy de períodos. */
export function periodKey(period?: string): string {
  const value = normalizePeriodText(period ?? "");
  if (!value) return "";
  const monthIndex = PERIOD_MONTHS.indexOf(value);
  if (monthIndex >= 0) return `month:${monthIndex + 1}`;
  const monthly = value.match(/\bmensual\s*(\d{1,2})\b/);
  if (monthly && Number(monthly[1]) >= 1 && Number(monthly[1]) <= 12) return `month:${Number(monthly[1])}`;
  const bimester = value.match(/\b(?:bim|bimestre)\s*(\d)\b/);
  if (bimester) return `bimester:${bimester[1]}`;
  const fourMonth = value.match(/\b(?:cuatri|cuatrim|cuatrimestre)\s*(\d)\b/);
  if (fourMonth) return `four-month:${fourMonth[1]}`;
  const quarter = value.match(/\b(?:tri|trimestre)\s*(\d)\b/);
  if (quarter) return `quarter:${quarter[1]}`;
  const semester = value.match(/\b(?:sem|semestre)\s*([12])\b/);
  if (semester) return `semester:${semester[1]}`;
  const installment = value.match(/\bcuota\s*(\d+)\b/);
  if (installment) return `installment:${installment[1]}`;
  if (/\banual\b/.test(value)) return "annual";
  return `text:${value}`;
}

export function displayPeriod(period?: string): string {
  const key = periodKey(period);
  const [kind, number] = key.split(":");
  if (kind === "month") return PERIOD_MONTHS[Number(number) - 1].replace(/^./, char => char.toUpperCase());
  if (kind === "bimester") return `Bimestre ${number}`;
  if (kind === "four-month") return `Cuatrimestre ${number}`;
  if (kind === "quarter") return `Trimestre ${number}`;
  if (kind === "semester") return `Semestre ${number}`;
  if (kind === "installment") return `Cuota ${number}`;
  if (key === "annual") return "Anual";
  return (period ?? "").trim();
}

export interface AlertChangeComparison {
  newIds: Set<string>;
  noLongerAlerted: PreviousAlertSnapshot[];
}

export interface ManualAlertDecision {
  companyMatches: boolean;
  resolved: boolean;
  representedByCalendar: boolean;
  hasCompletedDuplicate: boolean;
  dueDate: string;
  today: string;
  overdueFrom: string;
  upcomingWindow: number;
}

export function daysBetweenDateStrings(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Decide si una obligación manual debe aparecer, sin depender del calendario automático. */
export function shouldIncludeManualAlert(input: ManualAlertDecision): boolean {
  if (!input.companyMatches || input.resolved || input.representedByCalendar || input.hasCompletedDuplicate) {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return false;
  const daysLeft = daysBetweenDateStrings(input.today, input.dueDate);
  return (daysLeft < 0 && input.dueDate >= input.overdueFrom) ||
    (daysLeft >= 0 && daysLeft <= input.upcomingWindow);
}

/**
 * Compara el corte actual con el último correo del mismo destinatario.
 * Los historiales antiguos, que no guardaban recipientEmails, se usan solo para
 * detectar novedades globales; no pueden producir falsos "resueltos".
 */
export function compareAlertCuts(
  currentIds: Iterable<string>,
  previous: PreviousAlertSnapshot[],
  recipientEmail: string,
): AlertChangeComparison {
  const current = new Set(currentIds);
  const email = recipientEmail.toLowerCase();
  const recipientAware = previous.filter(snapshot =>
    snapshot.recipientEmails?.some(value => value.toLowerCase() === email),
  );
  const comparable = recipientAware.length > 0
    ? recipientAware
    : previous.filter(snapshot => !snapshot.recipientEmails?.length);
  const previousIds = new Set(comparable.map(snapshot => snapshot.obligationId).filter(Boolean) as string[]);

  return {
    newIds: new Set([...current].filter(id => !previousIds.has(id))),
    noLongerAlerted: recipientAware.filter(snapshot =>
      Boolean(snapshot.obligationId) && !current.has(snapshot.obligationId!),
    ),
  };
}
