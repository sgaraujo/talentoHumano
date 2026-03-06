import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Project } from '../models/types/Project';

class ProjectService {
  private col = 'projects';

  async getAll(): Promise<Project[]> {
    const snap = await getDocs(collection(db, this.col));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Project))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getByCompany(companyId: string): Promise<Project[]> {
    const snap = await getDocs(
      query(collection(db, this.col), where('companyId', '==', companyId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Project))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ref = await addDoc(collection(db, this.col), {
      ...data,
      headcount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async update(id: string, data: Partial<Project>): Promise<void> {
    await updateDoc(doc(db, this.col, id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, this.col, id));
  }

  /** Usuarios que tienen este proyecto en su projectIds[] */
  async getMembers(projectId: string): Promise<any[]> {
    const snap = await getDocs(
      query(collection(db, 'users'), where('projectIds', 'array-contains', projectId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /** Proyectos donde un usuario es líder */
  async getByLeader(leaderId: string): Promise<Project[]> {
    const snap = await getDocs(
      query(collection(db, this.col), where('leaderId', '==', leaderId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
  }
}

export const projectService = new ProjectService();
