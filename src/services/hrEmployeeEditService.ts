import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/config/firestoreCollections';

export type HrEditableValues = {
  corporateEmail?: string; personalEmail?: string; corporatePhone?: string; personalPhone?: string;
  eps?: string; afp?: string; ccf?: string; severanceFund?: string;
  bankName?: string; accountType?: string; accountNumber?: string;
};

const employeeFields = ['corporateEmail', 'personalEmail', 'corporatePhone', 'personalPhone'] as const;
const socialFields = ['eps', 'afp', 'ccf', 'severanceFund'] as const;
const bankingFields = ['bankName', 'accountType', 'accountNumber'] as const;
const clean = (value: unknown) => String(value ?? '').trim();

export async function updateHrEmployeeFields(employeeId: string, values: HrEditableValues, actor: string, source = 'manual') {
  const employeeRef = doc(db, FIRESTORE_COLLECTIONS.employees, employeeId);
  const socialRef = doc(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeePrivateData, 'social_security');
  const bankingRef = doc(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeePrivateData, 'banking');
  const [employeeSnap, socialSnap, bankingSnap] = await Promise.all([getDoc(employeeRef), getDoc(socialRef), getDoc(bankingRef)]);
  if (!employeeSnap.exists()) throw new Error(`No existe el expediente ${employeeId}.`);
  const employeePatch: Record<string, unknown> = {};
  const socialPatch: Record<string, unknown> = {};
  const bankingPatch: Record<string, unknown> = {};
  const changes: Array<{ field: string; previousValue: unknown; newValue: unknown }> = [];
  const assign = (fields: readonly string[], current: any, patch: Record<string, unknown>) => fields.forEach(field => {
    if (!(field in values)) return;
    const next = clean((values as any)[field]);
    if (clean(current?.[field]) === next) return;
    patch[field] = next;
    changes.push({ field, previousValue: current?.[field] ?? null, newValue: next });
  });
  assign(employeeFields, employeeSnap.data(), employeePatch);
  assign(socialFields, socialSnap.data(), socialPatch);
  assign(bankingFields, bankingSnap.data(), bankingPatch);
  if (!changes.length) return 0;
  if (Object.keys(employeePatch).length) await updateDoc(employeeRef, { ...employeePatch, updatedAt: serverTimestamp() });
  if (Object.keys(socialPatch).length) await setDoc(socialRef, { ...socialPatch, updatedAt: serverTimestamp() }, { merge: true });
  if (Object.keys(bankingPatch).length) await setDoc(bankingRef, { ...bankingPatch, updatedAt: serverTimestamp() }, { merge: true });
  await addDoc(collection(employeeRef, 'audit'), { source, changedBy: actor, changedAt: serverTimestamp(), changes });
  return changes.length;
}

export async function updateEmploymentTermination(
  employeeId: string, employmentId: string, values: { terminationReason?: string; terminationCost?: number }, actor: string,
) {
  const employmentRef = doc(db, FIRESTORE_COLLECTIONS.employees, employeeId, FIRESTORE_SUBCOLLECTIONS.employeeEmployments, employmentId);
  const snapshot = await getDoc(employmentRef);
  if (!snapshot.exists()) throw new Error('La relación laboral ya no existe.');
  const current = snapshot.data() as any;
  const patch: Record<string, unknown> = {};
  const changes: Array<{ field: string; previousValue: unknown; newValue: unknown }> = [];
  if ('terminationReason' in values) {
    const next = clean(values.terminationReason);
    if (next !== clean(current.terminationReason)) { patch.terminationReason = next; changes.push({ field: 'terminationReason', previousValue: current.terminationReason ?? null, newValue: next }); }
  }
  if ('terminationCost' in values) {
    const next = values.terminationCost;
    if (next !== current.terminationCost) { patch.terminationCost = next ?? null; changes.push({ field: 'terminationCost', previousValue: current.terminationCost ?? null, newValue: next ?? null }); }
  }
  if (!changes.length) return 0;
  await updateDoc(employmentRef, { ...patch, updatedAt: serverTimestamp() });
  await addDoc(collection(employmentRef, 'audit'), { source: 'manual', changedBy: actor, changedAt: serverTimestamp(), changes });
  return changes.length;
}

export const HR_PARTIAL_COLUMNS: Record<string, keyof HrEditableValues> = {
  'CORREO CORPORATIVO': 'corporateEmail', 'CORREO PERSONAL': 'personalEmail',
  'CORREO ELECTRONICO PERSONAL': 'personalEmail', 'TELEFONO CORPORATIVO': 'corporatePhone',
  'TELEFONO PERSONAL': 'personalPhone', EPS: 'eps', AFP: 'afp', CCF: 'ccf', CESANTIAS: 'severanceFund',
  'ENTIDAD BANCARIA': 'bankName', 'TIPO DE CUENTA': 'accountType', 'NUMERO DE CUENTA': 'accountNumber',
};

export interface HrPartialRow { row: number; documentNumber: string; values: HrEditableValues; }

export async function applyHrPartialUpdate(rows: HrPartialRow[], actor: string, onProgress?: (done: number, total: number) => void) {
  // Cada expediente conserva su auditoría independiente. El lote se divide
  // para no superar límites de red y poder informar progreso real.
  let updated = 0;
  for (let index = 0; index < rows.length; index++) {
    const count = await updateHrEmployeeFields(rows[index].documentNumber, rows[index].values, actor, 'partial_excel');
    if (count) updated++;
    onProgress?.(index + 1, rows.length);
  }
  return updated;
}
