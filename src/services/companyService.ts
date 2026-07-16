import {
  collection, collectionGroup, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '../config/firestoreCollections';
import type { Company } from '../models/types/Company';

class CompanyService {
  private col = FIRESTORE_COLLECTIONS.companies;

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

  /** No permite eliminar si la empresa tiene proyectos o relaciones laborales vinculadas por companyId. */
  async delete(id: string): Promise<void> {
    const [employments, projects] = await Promise.all([
      getDocs(query(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments), where('companyId', '==', id))),
      getDocs(query(collection(db, FIRESTORE_COLLECTIONS.projects), where('companyId', '==', id))),
    ]);
    if (!employments.empty || !projects.empty) {
      throw new Error('No se puede eliminar: la empresa tiene proyectos o relaciones laborales vinculadas. Márcala como inactiva en su lugar.');
    }
    await deleteDoc(doc(db, this.col, id));
  }
}

export const companyService = new CompanyService();
