import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db, functions } from "../config/firebase";
import { httpsCallable } from "firebase/functions";

interface Assignment {
  id: string;
  questionnaireId: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: "pending" | "completed";
  assignedAt: Date;
  completedAt?: Date;
  responseId?: string;
  token: string;

  // opcionales para auditoría de envío
  emailStatus?: "sent" | "failed";
  emailError?: string;
}


class AssignmentService {
  private collectionName = "questionnaire_assignments";

  private generateToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  async getAssignmentByEmailAndQuestionnaire(email: string, questionnaireId: string) {
    const q = query(
      collection(db, this.collectionName),
      where("userEmail", "==", email.toLowerCase()),
      where("questionnaireId", "==", questionnaireId)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const docData = snapshot.docs[0];
    return { id: docData.id, ...(docData.data() as any) } as Assignment;
  }


  async assignToUsers(
    questionnaireId: string,
    questionnaireTitle: string,
    users: Array<{ id: string; email: string; fullName: string }>,
    allowMultipleCompletions: boolean = false,
    resendIfPending: boolean = false
  ) {
    const results = {
      success: [] as string[],
      errors: [] as { email: string; error: string }[],
    };

    // base URL (recomendado para que no quede localhost en producción)
    const baseUrl = import.meta.env.VITE_APP_URL ?? window.location.origin;
    const sendAssignmentEmail = httpsCallable(functions, "sendAssignmentEmail");

    for (const user of users) {
      try {
        // Verificar si ya tiene asignación
        const existing = await this.getAssignmentByEmailAndQuestionnaire(user.email.toLowerCase(), questionnaireId);
        // Si no permite múltiples completaciones y ya completó, saltar
        if (
          existing &&
          existing.status === "completed" &&
          !allowMultipleCompletions
        ) {
          results.errors.push({
            email: user.email,
            error: "Ya completó este cuestionario",
          });
          continue;
        }

// Si ya tiene asignación pendiente, saltar
if (existing && existing.status === "pending") {
  if (!resendIfPending) {
    results.errors.push({
      email: user.email,
      error: "Ya tiene este cuestionario pendiente",
    });
    continue;
  }
}

const token = this.generateToken();
        const link = `${baseUrl}/responder/${token}`;

        // Crear asignación
        const docRef = await addDoc(collection(db, this.collectionName), {
          questionnaireId,
          userId: user.id,
          userEmail: user.email,
          userName: user.fullName,
          status: "pending",
          assignedAt: new Date(),
          token,
          emailStatus: "sent", // asumimos sent y si falla actualizamos
        });

        // Enviar correo vía callable
        try {
          await sendAssignmentEmail({
            to: user.email,
            userName: user.fullName,
            questionnaireTitle,
            link,
          });

          await updateDoc(doc(db, this.collectionName, docRef.id), {
            emailStatus: "sent",
            lastEmailSentAt: new Date(),
            emailError: "",
          });

          results.success.push(user.email);
        } catch (e: any) {
          await updateDoc(doc(db, this.collectionName, docRef.id), {
            emailStatus: "failed",
            emailError: e?.message || String(e),
          });

          results.errors.push({
            email: user.email,
            error: e?.message || String(e),
          });
        }


        // Enviar correo vía Outlook (Cloud Function)
        try {
          await sendAssignmentEmail({
            to: user.email,
            userName: user.fullName,
            questionnaireTitle,
            link,
          });

          await updateDoc(doc(db, this.collectionName, docRef.id), {
            emailStatus: "sent",
            lastEmailSentAt: new Date(),
          });

          results.success.push(user.email);
        } catch (e: any) {
          await updateDoc(doc(db, this.collectionName, docRef.id), {
            emailStatus: "failed",
            emailError: e?.message || String(e),
          });

          results.errors.push({
            email: user.email,
            error: e?.message || String(e),
          });
        }

      } catch (error) {
        console.error("Error asignando cuestionario a usuario:", error);
        throw error;
      }
    }

    return results;
  }

  async getAssignmentByToken(token: string): Promise<Assignment | null> {
    try {
      const q = query(
        collection(db, this.collectionName),
        where("token", "==", token)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const docData = snapshot.docs[0];
      return {
        id: docData.id,
        ...(docData.data() as any),
      } as Assignment;
    } catch (error) {
      console.error("Error obteniendo asignación por token:", error);
      throw error;
    }
  }

  async getAssignmentByUserAndQuestionnaire(
    userId: string,
    questionnaireId: string
  ): Promise<Assignment | null> {
    try {
      const q = query(
        collection(db, this.collectionName),
        where("userId", "==", userId),
        where("questionnaireId", "==", questionnaireId)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const docData = snapshot.docs[0];
      return {
        id: docData.id,
        ...(docData.data() as any),
      } as Assignment;
    } catch (error) {
      console.error("Error obteniendo asignación:", error);
      throw error;
    }
  }

  async markAsCompleted(assignmentId: string, responseId: string) {
    try {
      const assignmentRef = doc(db, this.collectionName, assignmentId);
      await updateDoc(assignmentRef, {
        status: "completed",
        completedAt: new Date(),
        responseId,
      });
    } catch (error) {
      console.error("Error marcando asignación como completada:", error);
      throw error;
    }
  }

  async getAssignmentsByQuestionnaire(
    questionnaireId: string
  ): Promise<Assignment[]> {
    try {
      const q = query(
        collection(db, this.collectionName),
        where("questionnaireId", "==", questionnaireId)
      );

      const snapshot = await getDocs(q);

      return snapshot.docs.map(
        (docData) =>
        ({
          id: docData.id,
          ...(docData.data() as any),
        } as Assignment)
      );
    } catch (error) {
      console.error("Error obteniendo asignaciones:", error);
      throw error;
    }
  }

  async getQuestionnaireStats(questionnaireId: string) {
    try {
      const assignments = await this.getAssignmentsByQuestionnaire(
        questionnaireId
      );

      return {
        total: assignments.length,
        completed: assignments.filter((a) => a.status === "completed").length,
        pending: assignments.filter((a) => a.status === "pending").length,
      };
    } catch (error) {
      console.error("Error obteniendo estadísticas:", error);
      throw error;
    }
  }
}

export const assignmentService = new AssignmentService();
