import {
  collection, addDoc, getDocs, doc, updateDoc, setDoc,
  query, orderBy, writeBatch, serverTimestamp, arrayUnion,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { FIRESTORE_COLLECTIONS } from '../config/firestoreCollections';
import type { TaxObligation, TaxStatus, StatusHistoryEntry } from '../models/types/TaxObligation';
import { sameCompany, normTax, displayTax, correctDueDateAgainstCalendar, normalizePeriod } from '../domain/tax/taxIdentity';

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
    const normalized = data.period !== undefined ? { ...data, period: normalizePeriod(data.period) } : data;
    await updateDoc(doc(db, this.col, id), { ...normalized, updatedAt: serverTimestamp() });
  }

  /** El array statusHistory es la única fuente leída por la UI (panel de historial). */
  async appendStatusHistory(id: string, entry: StatusHistoryEntry): Promise<void> {
    await updateDoc(doc(db, this.col, id), {
      statusHistory: arrayUnion(entry),
      updatedAt: serverTimestamp(),
    });
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

  /** Evita duplicados por doble clic o reintento de red: misma empresa, tipo de impuesto y vencimiento. */
  async create(obl: Omit<TaxObligation, 'id'>): Promise<string> {
    // Si el vencimiento ingresado se desvía de la fecha oficial DIAN para el NIT
    // de la empresa (p. ej. se tipeó la fecha del dígito de verificación
    // equivocado), se corrige automáticamente antes de guardar.
    const correction = correctDueDateAgainstCalendar(obl.nit, obl.taxType, obl.period, obl.dueDate);
    const withCanonicalPeriod = { ...obl, period: normalizePeriod(obl.period) };
    const finalObl = correction.corrected
      ? { ...withCanonicalPeriod, dueDate: correction.dueDate, year: correction.dueDate.slice(0, 4) }
      : withCanonicalPeriod;

    const existing = await this.getAll();
    const duplicate = existing.find(o =>
      sameCompany(o, { id: finalObl.companyId, name: finalObl.company, nit: finalObl.nit }) &&
      normTax(o.taxType) === normTax(finalObl.taxType) &&
      o.dueDate === finalObl.dueDate,
    );
    if (duplicate) {
      throw new Error(`Ya existe una obligación de "${displayTax(finalObl.taxType)}" con vencimiento ${finalObl.dueDate} para ${finalObl.company}.`);
    }
    const ref = await addDoc(collection(db, this.col), {
      ...finalObl,
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

}

export const taxCalendarService = new TaxCalendarService();
