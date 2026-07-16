import { collection, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
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
const employmentId = (row: any) => {
  const basis = [row.companyName, row.projectName, row.startDate, row.endDate].map(keyPart).join('|');
  return `${keyPart(row.companyName).slice(0, 24)}-${keyPart(row.projectName).slice(0, 24)}-${hash(basis)}`;
};

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
    const operations: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];
    const latestEmployee = new Map<string, (typeof plan.rows)[number]>();
    plan.rows.forEach(row => {
      const previous = latestEmployee.get(row.documentNumber);
      if (!previous || (previous.status === 'retired' && row.status === 'active')) latestEmployee.set(row.documentNumber, row);
      const employeeRef = doc(db, FIRESTORE_COLLECTIONS.employees, row.documentNumber);
      const relationId = employmentId(row.employment);
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
