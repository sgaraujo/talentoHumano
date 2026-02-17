import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import type { Questionnaire, QuestionnaireResponse } from "@/models/types/Questionnaire";

export interface ExportQueueItem {
  response: QuestionnaireResponse;
  questionnaire: Questionnaire;
}

class ExporterAdminService {
  private responsesCol = "questionnaire_responses";
  private questionnairesCol = "questionnaires";

  // Trae respuestas completadas NO exportadas o con error
 async getPendingExports(max: number = 100): Promise<ExportQueueItem[]> {
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
    where("exported", "==", null), // ✅ incluye missing
    orderBy("completedAt", "desc"),
    limit(max)
  );

  const [snapFalse, snapNull] = await Promise.all([getDocs(qFalse), getDocs(qNull)]);

  // ✅ merge sin duplicados
  const map = new Map<string, any>();
  for (const d of snapFalse.docs) map.set(d.id, d);
  for (const d of snapNull.docs) map.set(d.id, d);

  const docs = Array.from(map.values());

  const items: ExportQueueItem[] = [];
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

}

export const exporterAdminService = new ExporterAdminService();
