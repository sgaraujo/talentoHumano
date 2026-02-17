import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  updateDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "../config/firebase";
import type { User } from "../models/types/User";

class UserService {
  [x: string]: any;
  private collectionName = "users";

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

          if (cedula) {
            const qCedula = query(
              collection(db, this.collectionName),
              where("personalData.documentNumber", "==", cedula)
            );
            const snapCedula = await getDocs(qCedula);
            if (!snapCedula.empty) existing = snapCedula.docs[0];
          }

          if (!existing && userData.email) {
            const qEmail = query(
              collection(db, this.collectionName),
              where("email", "==", userData.email)
            );
            const snapEmail = await getDocs(qEmail);
            if (!snapEmail.empty) existing = snapEmail.docs[0];
          }

          if (existing) {
            // Actualizar el usuario existente con los datos completos
            await updateDoc(doc(db, this.collectionName, existing.id), userDoc);
            results.updated.push(userData.email);
          } else {
            // Crear nuevo
            userDoc.createdAt = new Date();
            await addDoc(collection(db, this.collectionName), userDoc);
            results.success.push(userData.email);
          }
        } catch (error: any) {
          results.errors.push({ email: userData.email, error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error("Error creating batch users:", error);
      throw error;
    }
  }
}

export const userService = new UserService();
