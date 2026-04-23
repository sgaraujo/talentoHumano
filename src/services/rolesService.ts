import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { PlatformUser, AppRole } from '../models/types/AppRole';

function normalize(email: string) {
  return email.trim().toLowerCase();
}

function toDate(v: any): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  if (v?.toDate) return v.toDate();
  return new Date(v);
}

class RolesService {
  private col = 'platform_roles';

  async getByEmail(email: string): Promise<PlatformUser | null> {
    const id = normalize(email);
    const snap = await getDoc(doc(db, this.col, id));
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...snap.data(),
      createdAt: toDate(snap.data().createdAt),
      updatedAt: toDate(snap.data().updatedAt),
    } as PlatformUser;
  }

  async getAll(): Promise<PlatformUser[]> {
    const snap = await getDocs(query(collection(db, this.col), orderBy('email')));
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: toDate(d.data().createdAt),
      updatedAt: toDate(d.data().updatedAt),
    })) as PlatformUser[];
  }

  async upsert(email: string, name: string, role: AppRole): Promise<void> {
    const id = normalize(email);
    const existing = await getDoc(doc(db, this.col, id));
    if (existing.exists()) {
      await updateDoc(doc(db, this.col, id), { name, role, updatedAt: serverTimestamp() });
    } else {
      await setDoc(doc(db, this.col, id), {
        email: id, name, role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    // Authorize login: add / reactivate in allowed_emails
    await setDoc(doc(db, 'allowed_emails', id), {
      email: id,
      active: true,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async delete(email: string): Promise<void> {
    const id = normalize(email);
    await deleteDoc(doc(db, this.col, id));
    // Revoke login access
    await setDoc(doc(db, 'allowed_emails', id), {
      active: false,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

export const rolesService = new RolesService();
