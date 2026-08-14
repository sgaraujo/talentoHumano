import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS } from '@/config/firestoreCollections';
import type { TaxImportRow } from '@/domain/tax/taxExcelImport';

/**
 * Aplica un plan de importación ya diagnosticado (buildTaxImportPlan). Las filas
 * 'update' nunca tocan el campo status — ese lo gestiona Contabilidad desde el
 * flujo de la ficha, no una carga masiva.
 */
export async function applyTaxImportPlan(rows: TaxImportRow[], actor: string): Promise<{ created: number; updated: number }> {
  const actionable = rows.filter(r => r.action === 'create' || r.action === 'update');
  const col = FIRESTORE_COLLECTIONS.taxObligations;
  const BATCH_SIZE = 400;
  let created = 0;
  let updated = 0;

  for (let offset = 0; offset < actionable.length; offset += BATCH_SIZE) {
    const batch = writeBatch(db);
    actionable.slice(offset, offset + BATCH_SIZE).forEach(row => {
      if (row.action === 'create') {
        const ref = doc(collection(db, col));
        batch.set(ref, {
          ...row.obligation,
          accountingUser: row.obligation.accountingUser || actor,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        created++;
      } else if (row.action === 'update' && row.existingId) {
        const { status: _status, ...patch } = row.obligation;
        batch.update(doc(db, col, row.existingId), { ...patch, updatedAt: serverTimestamp() });
        updated++;
      }
    });
    await batch.commit();
  }

  return { created, updated };
}
