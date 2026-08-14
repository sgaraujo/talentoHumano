import {
  collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, where, increment,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { FIRESTORE_COLLECTIONS } from '../config/firestoreCollections';
import { convertToWebP } from '../utils/imageUtils';
import type { Bulletin, BulletinSection, BulletinStatus, BulletinViewEntry } from '../models/types/Bulletin';

function toDate(v: any): Date {
  if (!v) return new Date();
  if (v instanceof Date) return v;
  if (v?.toDate) return v.toDate();
  return new Date(v);
}

function fromFirestore(id: string, data: any): Bulletin {
  return {
    ...data,
    id,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    publishedAt: data.publishedAt ? toDate(data.publishedAt) : undefined,
    sections: data.sections || [],
  } as Bulletin;
}

class BulletinService {
  private col = FIRESTORE_COLLECTIONS.bulletins;

  async getAll(): Promise<Bulletin[]> {
    const q = query(collection(db, this.col), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => fromFirestore(d.id, d.data()));
  }

  async getPublished(): Promise<Bulletin[]> {
    const q = query(
      collection(db, this.col),
      where('status', '==', 'published'),
      orderBy('publishedAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => fromFirestore(d.id, d.data()));
  }

  async getById(id: string): Promise<Bulletin | null> {
    const snap = await getDoc(doc(db, this.col, id));
    if (!snap.exists()) return null;
    return fromFirestore(snap.id, snap.data());
  }

  async create(params: {
    title: string;
    subtitle?: string;
    category?: string;
    heroImageUrl?: string;
    heroColor?: string;
    introText?: string;
    sections: BulletinSection[];
    status: BulletinStatus;
    createdBy: string;
    createdByName?: string;
    tags?: string[];
  }): Promise<string> {
    const now = serverTimestamp();
    const docRef = await addDoc(collection(db, this.col), {
      ...params,
      tags: params.tags || [],
      sections: params.sections || [],
      createdAt: now,
      updatedAt: now,
      ...(params.status === 'published' ? { publishedAt: now } : {}),
    });
    return docRef.id;
  }

  async update(id: string, params: Partial<Omit<Bulletin, 'id' | 'createdAt' | 'createdBy'>>): Promise<void> {
    const prevSnap = await getDoc(doc(db, this.col, id));
    const prev = prevSnap.data();
    const wasPublished = prev?.status === 'published';
    const nowPublished = params.status === 'published';

    await updateDoc(doc(db, this.col, id), {
      ...params,
      updatedAt: serverTimestamp(),
      ...(!wasPublished && nowPublished ? { publishedAt: serverTimestamp() } : {}),
    });
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, this.col, id));
  }

  async clone(id: string, createdBy: string, createdByName?: string): Promise<string> {
    const original = await this.getById(id);
    if (!original) throw new Error('Boletín no encontrado');
    const { id: _id, createdAt, updatedAt, publishedAt, views, ...rest } = original;
    return this.create({
      ...rest,
      title: `Copia de ${original.title}`,
      status: 'draft',
      createdBy,
      createdByName,
    });
  }

  async incrementViews(id: string): Promise<void> {
    await updateDoc(doc(db, this.col, id), { views: increment(1) });
  }

  async logView(bulletinId: string, entry: Omit<BulletinViewEntry, 'id' | 'viewedAt'>): Promise<void> {
    await addDoc(collection(db, FIRESTORE_COLLECTIONS.bulletins, bulletinId, 'views'), {
      ...entry,
      viewedAt: serverTimestamp(),
    });
  }

  async getViewLog(bulletinId: string): Promise<BulletinViewEntry[]> {
    const snap = await getDocs(query(collection(db, FIRESTORE_COLLECTIONS.bulletins, bulletinId, 'views'), orderBy('viewedAt', 'desc')));
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        email: data.email,
        phone: data.phone,
        name: data.name,
        source: data.source,
        viewedAt: data.viewedAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      } as BulletinViewEntry;
    });
  }

  async uploadImage(file: File, path: string): Promise<string> {
    const webp = await convertToWebP(file);
    // Ensure path always ends with .webp
    const webpPath = path.replace(/\.[^.]+$/, '') + '.webp';
    const storageRef = ref(storage, `bulletins/${webpPath}`);
    await uploadBytes(storageRef, webp, { contentType: 'image/webp' });
    return getDownloadURL(storageRef);
  }
}

export const bulletinService = new BulletinService();
