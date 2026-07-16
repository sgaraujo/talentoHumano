import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  writeBatch,
  query,
  where,
  updateDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { FIRESTORE_COLLECTIONS } from "../config/firestoreCollections";
import type { User } from "../models/types/User";

function normalizeEmail(email: any): string {
  return String(email || "").trim().toLowerCase();
}

function mergePlainObjects(base: any, incoming: any): any {
  if (!base || typeof base !== "object" || base instanceof Date) return incoming;
  if (!incoming || typeof incoming !== "object" || incoming instanceof Date) return incoming;

  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    const current = merged[key];
    merged[key] =
      current &&
      value &&
      typeof current === "object" &&
      typeof value === "object" &&
      !(current instanceof Date) &&
      !(value instanceof Date) &&
      !Array.isArray(current) &&
      !Array.isArray(value)
        ? mergePlainObjects(current, value)
        : value;
  }
  return merged;
}

class UserService {
  [x: string]: any;
  private collectionName = FIRESTORE_COLLECTIONS.users;

  /**
   * ✅ Crea/actualiza el usuario usando el UID como ID del documento:
   * users/{uid}
   */
  async upsertUserWithUid(uid: string, userData: Omit<User, "id">) {
    const ref = doc(db, this.collectionName, uid);
    const snap = await getDoc(ref);

    await setDoc(
      ref,
      {
        ...userData,
        createdAt: snap.exists()
          ? snap.data().createdAt ?? new Date()
          : new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return uid;
  }

  /**
   * ❗️Este método SOLO tiene sentido si ya tienes el uid.
   * Si lo llamas sin uid, no puedes garantizar users/{uid}.
   */
  async createUserWithUid(
    uid: string,
    userData: Pick<User, "email" | "fullName" | "role">
  ) {
    return this.upsertUserWithUid(uid, {
      email: userData.email,
      fullName: userData.fullName,
      role: userData.role,
      profileCompleted: false,
      completedOnboardings: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Omit<User, "id">);
  }

  async deleteUser(userId: string) {
    return this.delete(userId);
  }

  async getAll(): Promise<User[]> {
    try {
      const querySnapshot = await getDocs(collection(db, this.collectionName));

      return querySnapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          email: data.email || "",
          fullName: data.fullName || "",
          role: data.role || "colaborador",
          profileCompleted: data.profileCompleted || false,
          completedOnboardings: data.completedOnboardings || [],
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),

          personalData: data.personalData,
          demographicData: data.demographicData,
          preferences: data.preferences,
          family: data.family,
          location: data.location,
          professionalProfile: data.professionalProfile,
          contractInfo: data.contractInfo,
          salaryInfo: data.salaryInfo,
          socialSecurity: data.socialSecurity,
          bankingInfo: data.bankingInfo,
          administrativeRecord: data.administrativeRecord,
        } as User;
      });
    } catch (error) {
      console.error("Error getting users:", error);
      throw error;
    }
  }

  async deleteAll(): Promise<number> {
    try {
      const snapshot = await getDocs(collection(db, this.collectionName));
      let count = 0;
      for (const d of snapshot.docs) {
        await deleteDoc(doc(db, this.collectionName, d.id));
        count++;
      }
      console.log(`🗑️ ${count} usuarios eliminados`);
      return count;
    } catch (error) {
      console.error("Error deleting all users:", error);
      throw error;
    }
  }

  async delete(userId: string) {
    try {
      await deleteDoc(doc(db, this.collectionName, userId));
    } catch (error) {
      console.error("Error deleting user:", error);
      throw error;
    }
  }

  async update(userId: string, updates: any) {
    try {
      const userRef = doc(db, this.collectionName, userId);
      await updateDoc(userRef, {
        ...updates,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  }

  async checkEmailExists(email: string): Promise<boolean> {
    try {
      const q = query(collection(db, this.collectionName), where("email", "==", email));
      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error("Error checking email:", error);
      throw error;
    }
  }

  async createUser(userData: Pick<User, 'email' | 'fullName' | 'role'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, this.collectionName), {
        email: userData.email,
        fullName: userData.fullName,
        role: userData.role,
        profileCompleted: false,
        completedOnboardings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return docRef.id;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async getStats() {
    try {
      const users = await this.getAll();
      return {
        total: users.length,
        colaboradores: users.filter((u) => u.role === "colaborador").length,
        aspirantes: users.filter((u) => u.role === "aspirante").length,
        excolaboradores: users.filter((u) => u.role === "excolaborador").length,
        descartados: users.filter((u) => u.role === "descartado").length,
      };
    } catch (error) {
      console.error("Error getting stats:", error);
      throw error;
    }
  }

  async markEmailsAsExcolaborador(emails: string[]): Promise<number> {
    const forced = new Set(emails.map(normalizeEmail).filter(Boolean));
    if (forced.size === 0) return 0;

    const snapshot = await getDocs(collection(db, this.collectionName));
    let batch = writeBatch(db);
    let operationCount = 0;
    let updated = 0;

    const commitIfFull = async () => {
      if (operationCount < 450) return;
      await batch.commit();
      batch = writeBatch(db);
      operationCount = 0;
    };

    for (const d of snapshot.docs) {
      const data = d.data();
      const matches = [
        data.email,
        data.location?.corporateEmail,
        data.location?.personalEmail,
      ].some((email) => forced.has(normalizeEmail(email)));

      if (!matches || data.role === "excolaborador") continue;

      batch.update(doc(db, this.collectionName, d.id), {
        role: "excolaborador",
        updatedAt: new Date(),
      });
      operationCount++;
      updated++;
      await commitIfFull();
    }

    if (operationCount > 0) await batch.commit();
    return updated;
  }

  /**
   * ✅ Batch recomendado:
   * Si NO tienes uid (porque esos usuarios aún no existen en Auth),
   * entonces sí debes usar addDoc, pero OJO: esos docs NO coinciden con auth.uid.
   * Para onboarding/exportador, lo ideal es crear el doc cuando la persona hace login.
   */
  async createBatch(users: any[]) {
    try {
      const results = {
        success: [] as string[],
        updated: [] as string[],
        errors: [] as { email: string; error: string }[],
      };

      const existingUsersSnap = await getDocs(collection(db, this.collectionName));
      const usersByDocument = new Map<string, any>();
      const usersByEmail = new Map<string, any>();

      const indexDoc = (snapshotDoc: any) => {
        const data = snapshotDoc.data();
        const documentNumber = String(data.personalData?.documentNumber || "").trim();
        if (documentNumber && !usersByDocument.has(documentNumber)) {
          usersByDocument.set(documentNumber, snapshotDoc);
        }

        [
          data.email,
          data.location?.corporateEmail,
          data.location?.personalEmail,
        ].forEach((email) => {
          const normalized = normalizeEmail(email);
          if (normalized && !usersByEmail.has(normalized)) {
            usersByEmail.set(normalized, snapshotDoc);
          }
        });
      };

      existingUsersSnap.docs.forEach(indexDoc);

      const batches: any[] = [];
      let batch = writeBatch(db);
      let operationCount = 0;

      const queueWrite = (write: (currentBatch: ReturnType<typeof writeBatch>) => void) => {
        write(batch);
        operationCount++;
        if (operationCount >= 450) {
          batches.push(batch);
          batch = writeBatch(db);
          operationCount = 0;
        }
      };

      for (const userData of users) {
        try {
          // Construir documento completo preservando todos los campos del modelo
          const userDoc: any = {
            email: userData.email,
            fullName: userData.fullName,
            role: userData.role || "colaborador",
            profileCompleted: userData.profileCompleted ?? false,
            completedOnboardings: userData.completedOnboardings || [],
            updatedAt: new Date(),
          };

          // Agregar secciones opcionales solo si tienen datos
          if (userData.personalData) userDoc.personalData = userData.personalData;
          if (userData.location) userDoc.location = userData.location;
          if (userData.contractInfo) userDoc.contractInfo = userData.contractInfo;
          if (userData.salaryInfo) userDoc.salaryInfo = userData.salaryInfo;
          if (userData.socialSecurity) userDoc.socialSecurity = userData.socialSecurity;
          if (userData.bankingInfo) userDoc.bankingInfo = userData.bankingInfo;
          if (userData.administrativeRecord) userDoc.administrativeRecord = userData.administrativeRecord;
          if (userData.professionalProfile) userDoc.professionalProfile = userData.professionalProfile;
          if (userData.demographicData) userDoc.demographicData = userData.demographicData;
          if (userData.preferences) userDoc.preferences = userData.preferences;
          if (userData.family) userDoc.family = userData.family;

          // Buscar duplicado por cédula primero, luego por email
          const cedula = userData.personalData?.documentNumber;
          let existing: any = null;

          if (cedula) existing = usersByDocument.get(String(cedula).trim()) || null;
          if (!existing && userData.email) existing = usersByEmail.get(normalizeEmail(userData.email)) || null;

          if (existing) {
            const existingData = existing.data();
            const mergedUserDoc = {
              ...userDoc,
              personalData: userDoc.personalData
                ? mergePlainObjects(existingData.personalData, userDoc.personalData)
                : existingData.personalData,
              location: userDoc.location
                ? mergePlainObjects(existingData.location, userDoc.location)
                : existingData.location,
              contractInfo: userDoc.contractInfo
                ? mergePlainObjects(existingData.contractInfo, userDoc.contractInfo)
                : existingData.contractInfo,
              salaryInfo: userDoc.salaryInfo
                ? mergePlainObjects(existingData.salaryInfo, userDoc.salaryInfo)
                : existingData.salaryInfo,
              socialSecurity: userDoc.socialSecurity
                ? mergePlainObjects(existingData.socialSecurity, userDoc.socialSecurity)
                : existingData.socialSecurity,
              bankingInfo: userDoc.bankingInfo
                ? mergePlainObjects(existingData.bankingInfo, userDoc.bankingInfo)
                : existingData.bankingInfo,
              administrativeRecord: userDoc.administrativeRecord
                ? mergePlainObjects(existingData.administrativeRecord, userDoc.administrativeRecord)
                : existingData.administrativeRecord,
              professionalProfile: userDoc.professionalProfile
                ? mergePlainObjects(existingData.professionalProfile, userDoc.professionalProfile)
                : existingData.professionalProfile,
            };

            // Actualizar el usuario existente con los datos completos
            queueWrite((currentBatch) => {
              currentBatch.update(doc(db, this.collectionName, existing.id), mergedUserDoc);
            });
            results.updated.push(userData.email);

            indexDoc({
              id: existing.id,
              data: () => ({ ...existingData, ...mergedUserDoc }),
            });
          } else {
            // Crear nuevo
            userDoc.createdAt = new Date();
            const createdRef = doc(collection(db, this.collectionName));
            queueWrite((currentBatch) => {
              currentBatch.set(createdRef, userDoc);
            });
            results.success.push(userData.email);

            indexDoc({
              id: createdRef.id,
              data: () => userDoc,
            });
          }
        } catch (error: any) {
          results.errors.push({ email: userData.email, error: error.message });
        }
      }

      if (operationCount > 0) batches.push(batch);
      for (const pendingBatch of batches) {
        await pendingBatch.commit();
      }

      return results;
    } catch (error) {
      console.error("Error creating batch users:", error);
      throw error;
    }
  }
}

export const userService = new UserService();
