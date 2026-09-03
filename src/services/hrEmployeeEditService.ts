import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/config/firestoreCollections';

export type HrEditableValues = {
  corporateEmail?: string; personalEmail?: string; corporatePhone?: string; personalPhone?: string;
  eps?: string; afp?: string; ccf?: string; severanceFund?: string;
  bankName?: string; accountType?: string; accountNumber?: string;
};

export type HrNewEmployeeValues = {
  documentType?: string; documentNumber: string; fullName: string;
  birthDate?: string; gender?: string; nationality?: string;
  personalEmail?: string; personalPhone?: string; corporateEmail?: string; corporatePhone?: string;
  city?: string; department?: string; address?: string;
};

export type HrNewEmploymentValues = {
  companyId?: string; companyName?: string; projectId?: string; projectName?: string;
  position?: string; contractType?: string; startDate?: string; modality?: string; workday?: string;
  supervisor?: string; area?: string;
};

/** Crea un expediente nuevo (identificado por cédula) y, si se completó, su primera relación laboral activa. */
export async function createHrEmployee(
  employee: HrNewEmployeeValues, employment: HrNewEmploymentValues | null, actor: string,
) {
  const documentNumber = clean(employee.documentNumber);
  if (!documentNumber) throw new Error('La cédula es obligatoria.');
  if (!clean(employee.fullName)) throw new Error('El nombre completo es obligatorio.');

  const employeeRef = doc(db, FIRESTORE_COLLECTIONS.employees, documentNumber);
  const existing = await getDoc(employeeRef);
  if (existing.exists()) throw new Error(`Ya existe un expediente con la cédula ${documentNumber}.`);

  const hasEmployment = Boolean(employment && (employment.companyName || employment.companyId));

  await setDoc(employeeRef, {
    documentType: clean(employee.documentType), documentNumber, fullName: clean(employee.fullName),
    status: hasEmployment ? 'active' : 'unknown',
    birthDate: clean(employee.birthDate), gender: clean(employee.gender), nationality: clean(employee.nationality),
    personalEmail: clean(employee.personalEmail), personalPhone: clean(employee.personalPhone),
    corporateEmail: clean(employee.corporateEmail), corporatePhone: clean(employee.corporatePhone),
    residence: { city: clean(employee.city), department: clean(employee.department), address: clean(employee.address) },
    source: { system: 'application' },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await addDoc(collection(employeeRef, 'audit'), {
    source: 'manual_create', changedBy: actor, changedAt: serverTimestamp(),
    changes: [{ field: 'created', previousValue: null, newValue: true }],
  });

  let employmentId: string | undefined;
  if (hasEmployment) {
    const relationRef = doc(collection(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeeEmployments));
    employmentId = relationRef.id;
    await setDoc(relationRef, {
      employeeId: documentNumber, status: 'active',
      companyId: employment!.companyId || null, companyName: clean(employment!.companyName),
      projectId: employment!.projectId || null, projectName: clean(employment!.projectName),
      position: clean(employment!.position), contractType: clean(employment!.contractType),
      startDate: clean(employment!.startDate), modality: clean(employment!.modality), workday: clean(employment!.workday),
      supervisor: clean(employment!.supervisor), area: clean(employment!.area),
      source: { system: 'application' },
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }

  return { employeeId: documentNumber, employmentId };
}

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
  employeeId: string, employmentId: string, values: { terminationReason?: string; terminationCost?: number; endDate?: string }, actor: string,
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
  if ('endDate' in values) {
    const next = clean(values.endDate);
    if (next !== clean(current.endDate)) { patch.endDate = next; changes.push({ field: 'endDate', previousValue: current.endDate ?? null, newValue: next }); }
  }
  if (!changes.length) return 0;
  await updateDoc(employmentRef, { ...patch, updatedAt: serverTimestamp() });
  await addDoc(collection(employmentRef, 'audit'), { source: 'manual', changedBy: actor, changedAt: serverTimestamp(), changes });
  return changes.length;
}

export async function updateEmploymentStatus(
  employeeId: string,
  employmentId: string,
  status: 'active' | 'retired',
  values: { terminationReason?: string; terminationCost?: number; endDate?: string },
  actor: string,
) {
  const employeeRef = doc(db, FIRESTORE_COLLECTIONS.employees, employeeId);
  const employmentRef = doc(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeeEmployments, employmentId);
  const snapshot = await getDoc(employmentRef);
  if (!snapshot.exists()) throw new Error('La relación laboral ya no existe.');
  const current = snapshot.data() as any;
  if (status === 'retired' && !clean(values.endDate)) throw new Error('La fecha de retiro es obligatoria.');
  if (status === 'retired' && !clean(values.terminationReason)) throw new Error('El motivo de retiro es obligatorio.');

  const patch: Record<string, unknown> = status === 'active'
    ? { status: 'active', endDate: null, terminationReason: null, terminationCost: null, updatedAt: serverTimestamp() }
    : {
        status: 'retired', endDate: clean(values.endDate), terminationReason: clean(values.terminationReason),
        terminationCost: values.terminationCost ?? null, updatedAt: serverTimestamp(),
      };
  const relationships = await getDocs(collection(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeeEmployments));
  const hasActiveRelationship = relationships.docs.some(item =>
    item.id === employmentId ? status === 'active' : item.data().status === 'active');
  const auditRef = doc(collection(employmentRef, 'audit'));
  const batch = writeBatch(db);
  batch.update(employmentRef, patch);
  batch.set(auditRef, {
    source: 'manual_status_change', changedBy: actor, changedAt: serverTimestamp(),
    changes: [{ field: 'status', previousValue: current.status ?? null, newValue: status }],
  });
  batch.update(employeeRef, {
    status: hasActiveRelationship ? 'active' : 'retired',
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
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
