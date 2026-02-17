import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, getDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Questionnaire, QuestionnaireResponse } from '../models/types/Questionnaire';

class QuestionnaireService {
  private collectionName = 'questionnaires';
  private responsesCollection = 'questionnaire_responses';

  // Crear cuestionario
  async create(data: Omit<Questionnaire, 'id'>) {
    try {
      const docRef = await addDoc(collection(db, this.collectionName), {
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Cuestionario creado:', docRef.id);
      return docRef.id;
    } catch (error: any) {
      console.error('Error creando cuestionario:', error);
      throw new Error(`Error al crear cuestionario: ${error.message}`);
    }
  }

  // Obtener todos los cuestionarios
  async getAll() {
    try {
      const querySnapshot = await getDocs(collection(db, this.collectionName));
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Convertir Timestamps de Firestore a Date
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        };
      }) as Questionnaire[];
    } catch (error) {
      console.error('Error obteniendo cuestionarios:', error);
      throw error;
    }
  }
  // Obtener cuestionario por ID
  async getById(id: string) {
    try {
      const ref = doc(db, this.collectionName, id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;

      const data = snap.data();
      return {
        id: snap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      } as Questionnaire;
    } catch (error) {
      console.error('Error obteniendo cuestionario:', error);
      throw error;
    }
  }

  private async exportOnboardingToUser(params: {
    questionnaire: Questionnaire;
    userId: string;
    answers: Record<string, any>;
  }) {
    const { questionnaire, userId, answers } = params;

    if (!questionnaire.isOnboarding) return;
    if (!questionnaire.fieldMappings || questionnaire.fieldMappings.length === 0) return;

    const userRef = doc(db, "users", userId);

    // Si quieres respetar overwrite=false, necesitas leer user actual:
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? (userSnap.data() as Record<string, any>) : {};

    const patch: Record<string, any> = {};

    for (const m of questionnaire.fieldMappings) {
      const value = answers[m.questionId];

      if (value === undefined || value === null) continue;

      // overwrite false => no pisa si ya hay algo
      if (m.overwrite === false) {
        const currentValue = m.fieldPath
          .split(".")
          .reduce<any>((acc, k) => acc?.[k], userData);

        if (currentValue !== undefined && currentValue !== null && currentValue !== "") {
          continue;
        }
      }

      patch[m.fieldPath] = value;
    }

    // Marca onboarding como completado (siempre que se exporte)
    patch["onboarding.completed"] = true;
    patch["onboarding.completedAt"] = new Date();
    patch["onboarding.questionnaireId"] = questionnaire.id;

    if (Object.keys(patch).length === 0) return;

    await updateDoc(userRef, patch);
  }


  // Actualizar cuestionario
  async update(id: string, data: Partial<Questionnaire>) {
    try {
      const docRef = doc(db, this.collectionName, id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: new Date(),
      });
      console.log('Cuestionario actualizado:', id);
    } catch (error: any) {
      console.error('Error actualizando cuestionario:', error);
      throw new Error(`Error al actualizar cuestionario: ${error.message}`);
    }
  }

  // Eliminar cuestionario
  async delete(id: string) {
    try {
      await deleteDoc(doc(db, this.collectionName, id));
      console.log('Cuestionario eliminado:', id);
    } catch (error: any) {
      console.error('Error eliminando cuestionario:', error);
      throw new Error(`Error al eliminar cuestionario: ${error.message}`);
    }
  }

  // Guardar respuesta
  async saveResponse(response: Omit<QuestionnaireResponse, 'id'>) {
    try {
      // 1) Guardar respuesta
      const docRef = await addDoc(collection(db, this.responsesCollection), {
        questionnaireId: response.questionnaireId,
        userId: response.userId,
        answers: response.answers,
        status: response.status,
        completedAt: new Date(),
        exported: false,
        exportedAt: null,
        exportError: null,
      });

      // 2) Si es completed, intenta exportar (onboarding)
      if (response.status === "completed") {
        const questionnaire = await this.getById(response.questionnaireId);

        if (questionnaire?.isOnboarding) {
          try {
            await this.exportOnboardingToUser({
              questionnaire,
              userId: response.userId,
              answers: response.answers,
            });

            // marca export ok
            await updateDoc(doc(db, this.responsesCollection, docRef.id), {
              exported: true,
              exportedAt: new Date(),
              exportError: null,
            });
          } catch (e: any) {
            // marca export fail (para reintentar en tu modulo exportador)
            await updateDoc(doc(db, this.responsesCollection, docRef.id), {
              exported: false,
              exportError: e?.message || "Export failed",
            });
          }
        }
      }

      console.log('Respuesta guardada:', docRef.id);
      return docRef.id;
    } catch (error: any) {
      console.error('Error guardando respuesta:', error);
      throw new Error(`Error al guardar respuesta: ${error.message}`);
    }
  }



  // Obtener respuestas por cuestionario
  async getResponsesByQuestionnaire(questionnaireId: string) {
    try {
      const q = query(
        collection(db, this.responsesCollection),
        where('questionnaireId', '==', questionnaireId)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Convertir Timestamp a Date
          completedAt: data.completedAt?.toDate?.() || new Date(data.completedAt),
        };
      });
    } catch (error) {
      console.error('Error obteniendo respuestas:', error);
      throw error;
    }
  }

  async markResponseExported(responseId: string, ok: boolean, error?: string) {
    const ref = doc(db, this.responsesCollection, responseId);
    await updateDoc(ref, {
      exported: ok,
      exportedAt: ok ? new Date() : null,
      exportError: ok ? "" : (error || "Unknown error"),
    });
  }

  async getExportQueueByQuestionnaire(questionnaireId: string, max = 200) {
    const col = collection(db, this.responsesCollection);

    const qAll = query(
      col,
      where("questionnaireId", "==", questionnaireId),
      where("status", "==", "completed"),
      orderBy("completedAt", "desc"),
      limit(max)
    );

    const snap = await getDocs(qAll);

    return snap.docs.map((d) => {
      const data: any = d.data();
      return {
        id: d.id,
        questionnaireId: data.questionnaireId,
        userId: data.userId,
        answers: data.answers || {},
        status: data.status,
        completedAt: data.completedAt?.toDate?.() || new Date(data.completedAt),

        // 🔥 claves para UI
        exported: data.exported === true, // si no existe -> false
        exportedAt: data.exportedAt?.toDate?.() || data.exportedAt || null,
        exportError: data.exportError || "",
      };
    });
  }



  // Obtener estadísticas
  async getStats() {
    try {
      const questionnaires = await this.getAll();
      return {
        total: questionnaires.length,
        active: questionnaires.filter(q => q.active).length,
        inactive: questionnaires.filter(q => !q.active).length,
      };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }
}

export const questionnaireService = new QuestionnaireService();