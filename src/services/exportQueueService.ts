import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type { Questionnaire, QuestionnaireResponse } from "@/models/types/Questionnaire";
import { exporterService } from "@/services/exporterService";

type QueueItem = {
  response: QuestionnaireResponse;
  questionnaire: Questionnaire;
};

class ExportQueueService {
  private responsesCol = "questionnaire_responses";
  private questionnairesCol = "questionnaires";

  // 🔥 Trae cola pendiente: exported=false O exported==null (campo inexistente)
  async getPendingOnboardingQueue(max = 200): Promise<QueueItem[]> {
    const base = collection(db, this.responsesCol);

    const qFalse = query(
      base,
      where("status", "==", "completed"),
      where("exported", "==", false),
      orderBy("completedAt", "desc"),
      limit(max)
    );

    const qNull = query(
      base,
      where("status", "==", "completed"),
      where("exported", "==", null), // incluye missing
      orderBy("completedAt", "desc"),
      limit(max)
    );

    const [snapFalse, snapNull] = await Promise.all([getDocs(qFalse), getDocs(qNull)]);

    const map = new Map<string, any>();
    snapFalse.docs.forEach((d) => map.set(d.id, d));
    snapNull.docs.forEach((d) => map.set(d.id, d));
    const docs = Array.from(map.values());

    const items: QueueItem[] = [];

    for (const d of docs) {
      const data: any = d.data();

      const response: QuestionnaireResponse = {
        id: d.id,
        questionnaireId: data.questionnaireId,
        userId: data.userId,
        answers: data.answers || {},
        status: data.status,
        completedAt: data.completedAt?.toDate?.() || new Date(data.completedAt),
        exported: data.exported,
        exportedAt: data.exportedAt?.toDate?.() || data.exportedAt,
        exportError: data.exportError || "",
      };

      // cargar cuestionario
      const qRef = doc(db, this.questionnairesCol, response.questionnaireId);
      const qSnap = await getDoc(qRef);
      if (!qSnap.exists()) continue;

      const qData: any = qSnap.data();
      const questionnaire: Questionnaire = {
        id: qSnap.id,
        title: qData.title,
        description: qData.description,
        questions: qData.questions || [],
        targetRole: qData.targetRole,
        active: !!qData.active,
        createdBy: qData.createdBy,
        createdAt: qData.createdAt?.toDate?.() || new Date(qData.createdAt),
        updatedAt: qData.updatedAt?.toDate?.() || new Date(qData.updatedAt),
        isOnboarding: !!qData.isOnboarding,
        isRequired: !!qData.isRequired,
        allowMultipleCompletions: !!qData.allowMultipleCompletions,
        fieldMappings: qData.fieldMappings || [],
      };

      if (!questionnaire.isOnboarding) continue;
      items.push({ response, questionnaire });
    }

    return items;
  }

  // Reintentar export de un response puntual
  async exportOne(item: QueueItem) {
    const { questionnaire, response } = item;
    try {
      await exporterService.exportOnboarding({
        questionnaire,
        userId: response.userId,
        answers: response.answers,
      });

      await updateDoc(doc(db, this.responsesCol, response.id), {
        exported: true,
        exportedAt: new Date(),
        exportError: "",
      });
      return { ok: true as const };
    } catch (e: any) {
      await updateDoc(doc(db, this.responsesCol, response.id), {
        exported: false,
        exportedAt: null,
        exportError: e?.message || String(e),
      });
      return { ok: false as const, error: e?.message || String(e) };
    }
  }
}

export const exportQueueService = new ExportQueueService();
