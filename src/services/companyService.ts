import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Company } from '../models/types/Company';

class CompanyService {
  private col = 'companies';

  async getAll(): Promise<Company[]> {
    const snap = await getDocs(collection(db, this.col));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Company));
  }

  async create(data: Omit<Company, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = await addDoc(collection(db, this.col), {
      ...data,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, data: Partial<Company>): Promise<void> {
    await updateDoc(doc(db, this.col, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, this.col, id));
  }

  /** Busca por companyId (array-contains) — forma correcta */
  async getUsersByCompany(companyId: string) {
    const snap = await getDocs(
      query(collection(db, 'users'), where('companyIds', 'array-contains', companyId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /** Compatibilidad: busca por nombre (string) — para datos legacy */
  async getUsersByCompanyName(companyName: string) {
    const snap = await getDocs(
      query(collection(db, 'users'), where('contractInfo.assignment.company', '==', companyName))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export const companyService = new CompanyService();
