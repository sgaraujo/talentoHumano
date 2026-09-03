import { collection, collectionGroup, doc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/config/firestoreCollections';
import type { HrImportPlan } from '@/domain/humanResources/hrExcelPreview';

const keyPart = (value: unknown) => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'sin-dato';
const hash = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
};
// Fecha -> "AAAA-MM-DD" en calendario local (evita el corrimiento de d\u00eda de toISOString con UTC).
const dateKey = (value: unknown) => {
  let date: Date | undefined;
  if (value instanceof Date) date = value;
  else if (typeof (value as any)?.toDate === 'function') date = (value as any).toDate();
  else if (typeof (value as any)?.seconds === 'number') date = new Date((value as any).seconds * 1000);
  else if (typeof (value as any)?._seconds === 'number') date = new Date((value as any)._seconds * 1000);
  else if (typeof value === 'string') {
    const timestampMatch = value.match(/Timestamp\s*\(\s*seconds\s*=\s*(-?\d+)/i);
    if (timestampMatch) date = new Date(Number(timestampMatch[1]) * 1000);
    else if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const [year, month, day] = value.slice(0, 10).split('-').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      const parts = value.trim().split(/[\/-]/).map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        const [first, second, rawYear] = parts;
        const year = rawYear < 100 ? (rawYear < 50 ? 2000 + rawYear : 1900 + rawYear) : rawYear;
        // Los textos históricos fueron generados mayoritariamente con locale
        // en-US (M/D/YYYY). Solo usar D/M cuando el primer valor no puede ser mes.
        date = first > 12
          ? new Date(year, second - 1, first)
          : new Date(year, first - 1, second);
      }
    }
  }
  if (date && !Number.isNaN(date.getTime())) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  return keyPart(value);
};
// El id NO debe depender de proyecto ni de fecha de retiro: ambos pueden variar
// entre cargas del mismo contrato real (columna PROYECTO vac\u00eda en una fila,
// o una persona que pasa de activa a retirada) y antes generaban un documento
// nuevo en vez de actualizar el existente.
const employmentId = (row: any) => {
  const basis = [row.companyName, dateKey(row.startDate)].join('|');
  return `${keyPart(row.companyName).slice(0, 24)}-${hash(basis)}`;
};
const employmentBusinessKey = (employeeId: unknown, row: any) =>
  `${keyPart(employeeId)}|${keyPart(row.companyName)}|${dateKey(row.startDate)}`;

export async function applyHrImport(
  plan: HrImportPlan,
  actor: string,
  onProgress?: (percent: number, label: string) => void,
) {
  const runRef = doc(collection(db, FIRESTORE_COLLECTIONS.humanResourceImportRuns));
  const uniqueEmployees = new Set(plan.rows.map(row => row.documentNumber));
  await setDoc(runRef, {
    fileName: plan.fileName, sheetName: plan.sheetName, status: 'processing', mode: 'apply',
    totals: { rows: plan.rows.length, valid: plan.rows.length, newRecords: 0, changed: 0, unchanged: 0, conflicts: 0, rejected: 0 },
    createdBy: actor, createdAt: serverTimestamp(), startedAt: serverTimestamp(), schemaVersion: 1,
  });

  try {
    // Reutilizar el documento existente aunque haya sido creado históricamente
    // con un ID derivado de un Timestamp. Así una nueva carga no duplica el
    // contrato por diferencias de representación de la misma fecha.
    const existingRelationsSnap = await getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments));
    const existingRelationIds = new Map<string, { id: string; completeness: number }>();
    existingRelationsSnap.docs.forEach(snapshot => {
      const relation = snapshot.data() as any;
      const employeeId = relation.employeeId || snapshot.ref.parent.parent?.id;
      if (!employeeId) return;
      const key = employmentBusinessKey(employeeId, relation);
      const completeness = [relation.projectName, relation.companyId, relation.projectId, relation.position, relation.contractType]
        .filter(value => String(value ?? '').trim()).length;
      const previous = existingRelationIds.get(key);
      if (!previous || completeness > previous.completeness) {
        existingRelationIds.set(key, { id: snapshot.id, completeness });
      }
    });

    const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    const latestEmployee = new Map<string, (typeof plan.rows)[number]>();
    plan.rows.forEach(row => {
      const previous = latestEmployee.get(row.documentNumber);
      if (!previous || (previous.status === 'retired' && row.status === 'active')) latestEmployee.set(row.documentNumber, row);
      const employeeRef = doc(db, FIRESTORE_COLLECTIONS.employees, row.documentNumber);
      const relationId = existingRelationIds.get(employmentBusinessKey(row.documentNumber, row.employment))?.id
        ?? employmentId(row.employment);
      const relationRef = doc(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeeEmployments, relationId);
      operations.push(batch => batch.set(relationRef, {
        ...row.employment, id: relationId, employeeId: row.documentNumber,
        source: { system: 'excel', importRunId: runRef.id, sourceRow: row.sourceRow }, updatedAt: serverTimestamp(),
      }, { merge: true }));
      if (Object.keys(row.payroll).length) operations.push(batch => batch.set(doc(relationRef, FIRESTORE_SUBCOLLECTIONS.employeePrivateData, 'payroll'), { ...row.payroll, updatedAt: serverTimestamp() }, { merge: true }));
    });
    latestEmployee.forEach(row => {
      const employeeRef = doc(db, FIRESTORE_COLLECTIONS.employees, row.documentNumber);
      operations.push(batch => batch.set(employeeRef, {
        ...row.employee, id: row.documentNumber, identityUserId: row.identityUserId || null,
        source: { system: 'excel', importRunId: runRef.id, sourceRow: row.sourceRow }, updatedAt: serverTimestamp(),
      }, { merge: true }));
      if (Object.keys(row.banking).length) operations.push(batch => batch.set(doc(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeePrivateData, 'banking'), { ...row.banking, updatedAt: serverTimestamp() }, { merge: true }));
      if (Object.keys(row.socialSecurity).length) operations.push(batch => batch.set(doc(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeePrivateData, 'social_security'), { ...row.socialSecurity, updatedAt: serverTimestamp() }, { merge: true }));
    });

    const chunkSize = 400;
    for (let offset = 0; offset < operations.length; offset += chunkSize) {
      const batch = writeBatch(db);
      operations.slice(offset, offset + chunkSize).forEach(operation => operation(batch));
      await batch.commit();
      const completed = Math.min(offset + chunkSize, operations.length);
      onProgress?.(Math.round(completed / operations.length * 100), `Guardando lote ${Math.ceil(completed / chunkSize)} de ${Math.ceil(operations.length / chunkSize)}`);
    }
    await setDoc(runRef, { status: 'completed', completedAt: serverTimestamp(), employeeCount: uniqueEmployees.size, relationshipCount: plan.rows.length, writeCount: operations.length }, { merge: true });
    return { runId: runRef.id, employees: uniqueEmployees.size, relationships: plan.rows.length, writes: operations.length };
  } catch (error: any) {
    await setDoc(runRef, { status: 'failed', failedAt: serverTimestamp(), error: String(error?.message || error).slice(0, 500) }, { merge: true });
    throw error;
  }
}
