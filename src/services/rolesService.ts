import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, serverTimestamp, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { FIRESTORE_COLLECTIONS } from '../config/firestoreCollections';
import type { PlatformUser, AppRole } from '../models/types/AppRole';
import { EXTERNAL_ROLES } from '../models/types/AppRole';

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
  private col = FIRESTORE_COLLECTIONS.platformRoles;

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

  /** companyIds solo aplica a roles acotados por empresa; para el resto se limpia. */
  /** Correos de cuentas externas (EXTERNAL_ROLES), para excluirlas de listados de personas y envíos. */
  async getExternalEmails(): Promise<Set<string>> {
    const snap = await getDocs(query(collection(db, this.col), where('role', 'in', EXTERNAL_ROLES)));
    return new Set(snap.docs.map(d => normalize(d.data().email || d.id)));
  }

  async upsert(email: string, name: string, role: AppRole, companyIds: string[] = []): Promise<void> {
    const id = normalize(email);
    const existing = await getDoc(doc(db, this.col, id));
    if (existing.exists()) {
      await updateDoc(doc(db, this.col, id), { name, role, companyIds, updatedAt: serverTimestamp() });
    } else {
      await setDoc(doc(db, this.col, id), {
        email: id, name, role, companyIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    // Authorize login: add / reactivate in allowed_emails
    await setDoc(doc(db, FIRESTORE_COLLECTIONS.allowedEmails, id), {
      email: id,
      active: true,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async delete(email: string): Promise<void> {
    const id = normalize(email);
    await deleteDoc(doc(db, this.col, id));
    // Revoke login access
    await setDoc(doc(db, FIRESTORE_COLLECTIONS.allowedEmails, id), {
      active: false,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}

export const rolesService = new RolesService();
