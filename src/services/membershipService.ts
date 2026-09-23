import {
  collection, getDocs, addDoc, deleteDoc,
  doc, query, where, serverTimestamp, updateDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { FIRESTORE_COLLECTIONS } from '../config/firestoreCollections';
import type { CompanyMembership, ProjectMembership, MembershipRole } from '../models/types/Membership';

class MembershipService {
  private companyCol = FIRESTORE_COLLECTIONS.companyMemberships;
  private projectCol = FIRESTORE_COLLECTIONS.projectMemberships;

  // Cache denormalizado en `identity/data/users/{userId}` para queries rápidas
  // desde pantallas que aún leen esa colección legada. Cada vez más personas
  // (las que vienen de Expedientes y control sin cuenta en esa colección) no
  // tienen ese documento — en ese caso el cache simplemente no aplica, pero
  // eso no debe tumbar la membresía real, que ya quedó guardada en su propia
  // colección arriba.
  private async syncLegacyUserArray(userId: string, field: 'companyIds' | 'projectIds', op: 'union' | 'remove', value: string): Promise<void> {
    try {
      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.users, userId), {
        [field]: op === 'union' ? arrayUnion(value) : arrayRemove(value),
      });
    } catch (error: any) {
      if (error?.code !== 'not-found') throw error;
    }
  }

  // ── Company memberships ───────────────────────────────────────────────────

  async addToCompany(userId: string, companyId: string, role: MembershipRole = 'miembro'): Promise<void> {
    // Evitar duplicados
    const existing = await getDocs(
      query(collection(db, this.companyCol),
        where('userId', '==', userId),
        where('companyId', '==', companyId))
    );
    if (!existing.empty) {
      // Actualizar rol si cambió
      await updateDoc(doc(db, this.companyCol, existing.docs[0].id), { role });
    } else {
      await addDoc(collection(db, this.companyCol), {
        userId, companyId, role,
        joinedAt: serverTimestamp(),
      });
    }
    // Mantener array en usuario para queries rápidos
    await this.syncLegacyUserArray(userId, 'companyIds', 'union', companyId);
  }

  async removeFromCompany(userId: string, companyId: string): Promise<void> {
    const snap = await getDocs(
      query(collection(db, this.companyCol),
        where('userId', '==', userId),
        where('companyId', '==', companyId))
    );
    for (const d of snap.docs) await deleteDoc(doc(db, this.companyCol, d.id));
    await this.syncLegacyUserArray(userId, 'companyIds', 'remove', companyId);
  }

  async getUserCompanies(userId: string): Promise<CompanyMembership[]> {
    const snap = await getDocs(
      query(collection(db, this.companyCol), where('userId', '==', userId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CompanyMembership));
  }

  async getCompanyMembers(companyId: string): Promise<CompanyMembership[]> {
    const snap = await getDocs(
      query(collection(db, this.companyCol), where('companyId', '==', companyId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CompanyMembership));
  }

  // ── Project memberships ───────────────────────────────────────────────────

  async addToProject(
    userId: string, projectId: string, companyId: string, role: MembershipRole = 'miembro'
  ): Promise<void> {
    const existing = await getDocs(
      query(collection(db, this.projectCol),
        where('userId', '==', userId),
        where('projectId', '==', projectId))
    );
    if (!existing.empty) {
      await updateDoc(doc(db, this.projectCol, existing.docs[0].id), { role });
    } else {
      await addDoc(collection(db, this.projectCol), {
        userId, projectId, companyId, role,
        joinedAt: serverTimestamp(),
      });
    }
    await this.syncLegacyUserArray(userId, 'projectIds', 'union', projectId);
  }

  async removeFromProject(userId: string, projectId: string): Promise<void> {
    const snap = await getDocs(
      query(collection(db, this.projectCol),
        where('userId', '==', userId),
        where('projectId', '==', projectId))
    );
    for (const d of snap.docs) await deleteDoc(doc(db, this.projectCol, d.id));
    await this.syncLegacyUserArray(userId, 'projectIds', 'remove', projectId);
  }

  async getUserProjects(userId: string): Promise<ProjectMembership[]> {
    const snap = await getDocs(
      query(collection(db, this.projectCol), where('userId', '==', userId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectMembership));
  }

  async getProjectMembers(projectId: string): Promise<ProjectMembership[]> {
    const snap = await getDocs(
      query(collection(db, this.projectCol), where('projectId', '==', projectId))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectMembership));
  }

  async updateProjectRole(userId: string, projectId: string, role: MembershipRole): Promise<void> {
    const snap = await getDocs(
      query(collection(db, this.projectCol),
        where('userId', '==', userId),
        where('projectId', '==', projectId))
    );
    for (const d of snap.docs) await updateDoc(doc(db, this.projectCol, d.id), { role });
  }
}

export const membershipService = new MembershipService();
