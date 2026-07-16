import {
  collection, addDoc, getDocs, doc, updateDoc, setDoc,
  query, orderBy, writeBatch, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '../config/firestoreCollections';
import type { TaxObligation, TaxStatus, StatusHistoryEntry } from '../models/types/TaxObligation';
import type { Company } from '../models/types/Company';

function toDate(v: any): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  if (v?.toDate) return v.toDate();
  return new Date(v);
}

/** Convierte dueDate a string YYYY-MM-DD sin desplazar el día por zona horaria. */
function normalizeDueDate(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  let d: Date;
  if (v?.toDate) d = v.toDate();
  else if (v instanceof Date) d = v;
  else return String(v);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class TaxCalendarService {
  private col = FIRESTORE_COLLECTIONS.taxObligations;

  async getAll(): Promise<TaxObligation[]> {
    const snap = await getDocs(query(collection(db, this.col), orderBy('dueDate', 'asc')));
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        dueDate:   normalizeDueDate(data.dueDate) ?? data.dueDate,
        updatedAt: toDate(data.updatedAt),
        createdAt: toDate(data.createdAt),
      };
    }) as TaxObligation[];
  }

  async updateStatus(id: string, status: TaxStatus, observation?: string): Promise<void> {
    const data: any = { status, updatedAt: serverTimestamp() };
    if (observation !== undefined) data.observation = observation;
    await updateDoc(doc(db, this.col, id), data);
  }

  async updateAttachments(id: string, attachments: import('../models/types/TaxObligation').TaxAttachment[]): Promise<void> {
    await updateDoc(doc(db, this.col, id), { attachments, updatedAt: serverTimestamp() });
  }

  async update(id: string, data: Partial<Omit<TaxObligation, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(db, this.col, id), { ...data, updatedAt: serverTimestamp() });
  }

  async appendStatusHistory(id: string, entry: StatusHistoryEntry): Promise<void> {
    const batch = writeBatch(db);
    const obligationRef = doc(db, this.col, id);
    const historyRef = doc(collection(
      db,
      this.col,
      id,
      FIRESTORE_SUBCOLLECTIONS.taxObligationHistory,
    ));

    // Escritura dual temporal: la subcolección será la fuente oficial y el
    // array mantiene compatibilidad con la interfaz durante la migración.
    batch.update(obligationRef, {
      statusHistory: arrayUnion(entry),
      updatedAt: serverTimestamp(),
    });
    batch.set(historyRef, {
      ...entry,
      obligationId: id,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  }

  async getCompanyTaxSettings(): Promise<Record<string, string[]>> {
    const snap = await getDocs(collection(db, FIRESTORE_COLLECTIONS.companyTaxSettings));
    return Object.fromEntries(snap.docs.map(d => [
      d.id,
      Array.isArray(d.data().excludedTaxTypes) ? d.data().excludedTaxTypes : [],
    ]));
  }

  async updateCompanyTaxSettings(companyId: string, excludedTaxTypes: string[]): Promise<void> {
    await setDoc(doc(db, FIRESTORE_COLLECTIONS.companyTaxSettings, companyId), {
      companyId,
      excludedTaxTypes,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async recordDailyActivity(entry: {
    changedBy: string;
    company: string;
    nit?: string;
    taxType: string;
    period?: string;
    dueDate?: string;
    newStatus: TaxStatus;
    projected?: number | null;
    obligationId?: string;
  }): Promise<void> {
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    await addDoc(collection(db, FIRESTORE_COLLECTIONS.taxDailyLog), {
      ...entry,
      date,
      changedAt: serverTimestamp(),
    });
  }

  async delete(id: string): Promise<void> {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, this.col, id));
  }

  async create(obl: Omit<TaxObligation, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, this.col), {
      ...obl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async seedFromArray(records: Omit<TaxObligation, 'id'>[]): Promise<void> {
    const BATCH_SIZE = 400;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = records.slice(i, i + BATCH_SIZE);
      chunk.forEach(rec => {
        const ref = doc(collection(db, this.col));
        batch.set(ref, { ...rec, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      await batch.commit();
    }
  }

  async isEmpty(): Promise<boolean> {
    const snap = await getDocs(collection(db, this.col));
    return snap.empty;
  }

  async deleteAll(): Promise<number> {
    const snap = await getDocs(collection(db, this.col));
    const BATCH_SIZE = 400;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    return docs.length;
  }

  /**
   * Compares tax obligations with companies by name (case-insensitive, trimmed).
   * For each match, updates the obligation's `company` and `nit` fields with
   * the values from the Company model.
   * Returns the number of updated records.
   */
  async syncWithCompanies(companies: Company[]): Promise<number> {
    const obligations = await this.getAll();

    // Build a normalized name → company map
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const companyMap = new Map<string, Company>();
    companies.forEach(c => companyMap.set(normalize(c.name), c));

    const BATCH_SIZE = 400;
    let updated = 0;
    const toUpdate: { id: string; company: string; nit: string }[] = [];

    for (const obl of obligations) {
      const match = companyMap.get(normalize(obl.company));
      if (!match) continue;
      // Only update if something actually differs
      if (obl.nit === match.nit && obl.company === match.name) continue;
      toUpdate.push({ id: obl.id, company: match.name, nit: match.nit });
    }

    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      toUpdate.slice(i, i + BATCH_SIZE).forEach(({ id, company, nit }) => {
        batch.update(doc(db, this.col, id), { company, nit, updatedAt: serverTimestamp() });
      });
      await batch.commit();
      updated += Math.min(BATCH_SIZE, toUpdate.length - i);
    }

    return updated;
  }
}

export const taxCalendarService = new TaxCalendarService();
