import { useCallback, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/config/firebase";
import { FIRESTORE_COLLECTIONS } from "@/config/firestoreCollections";

interface RawAssignment {
  id: string;
  questionnaireId: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: "pending" | "completed";
  emailStatus?: "sent" | "failed" | "pending" | string;
  emailError?: string;
  assignedAt: Date | null;
  lastEmailSentAt: Date | null;
}

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export interface EmailProjectRow {
  projectId: string;
  projectName: string;
  total: number;
  sent: number;
  failed: number;
  noStatus: number;
  deliveryRate: number;
}

export interface EmailQuestionnaireRow {
  id: string;
  title: string;
  active: boolean;
  total: number;
  sent: number;
  failed: number;
  deliveryRate: number;
}

export interface EmailRoleRow {
  role: string;
  total: number;
  sent: number;
  failed: number;
  deliveryRate: number;
}

export interface EmailFailRow {
  assignmentId: string;
  userName: string;
  userEmail: string;
  questionnaireTitle: string;
  assignedAt: Date | null;
  error: string;
}

export interface EmailTimelinePoint {
  date: string;
  sent: number;
  failed: number;
}

export interface EmailGlobalStats {
  total: number;
  sent: number;
  failed: number;
  noStatus: number;
  deliveryRate: number;
  topFailReason: string;
}

export interface NoProjectUserRow {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
  company: string;
  assignments: number;
  sent: number;
  failed: number;
  questionnaires: string[];
  lastActivity: Date | null;
}

export function useEmailSendStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [globalStats, setGlobalStats] = useState<EmailGlobalStats>({
    total: 0, sent: 0, failed: 0, noStatus: 0, deliveryRate: 0, topFailReason: "",
  });
  const [byProject, setByProject] = useState<EmailProjectRow[]>([]);
  const [byQuestionnaire, setByQuestionnaire] = useState<EmailQuestionnaireRow[]>([]);
  const [byRole, setByRole] = useState<EmailRoleRow[]>([]);
  const [failures, setFailures] = useState<EmailFailRow[]>([]);
  const [timeline, setTimeline] = useState<EmailTimelinePoint[]>([]);
  const [noProjectUsers, setNoProjectUsers] = useState<NoProjectUserRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [aSnap, qSnap, uSnap, pSnap] = await Promise.all([
        getDocs(collection(db, FIRESTORE_COLLECTIONS.questionnaireAssignments)),
        getDocs(collection(db, FIRESTORE_COLLECTIONS.questionnaires)),
        getDocs(collection(db, FIRESTORE_COLLECTIONS.users)),
        getDocs(collection(db, FIRESTORE_COLLECTIONS.projects)),
      ]);

      const assignments: RawAssignment[] = aSnap.docs.map(d => {
        const x: any = d.data();
        return {
          id: d.id,
          questionnaireId: x.questionnaireId ?? "",
          userId: x.userId ?? "",
          userEmail: x.userEmail ?? "",
          userName: x.userName ?? "",
          status: x.status,
          emailStatus: x.emailStatus,
          emailError: x.emailError ?? "",
          assignedAt: toDate(x.assignedAt),
          lastEmailSentAt: toDate(x.lastEmailSentAt) ?? toDate(x.assignedAt),
        };
      });

      const questionnaires = qSnap.docs.map(d => ({
        id: d.id, ...(d.data() as any),
      }));
      const users = uSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const projects = pSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      const qMap = new Map(questionnaires.map((q: any) => [q.id, q]));
      const userMap = new Map(users.map((u: any) => [u.id, u]));
      const projectMap = new Map<string, string>(projects.map((p: any) => [p.id, p.name]));

      const isSent = (a: RawAssignment) => a.emailStatus === "sent";
      const isFailed = (a: RawAssignment) => a.emailStatus === "failed";
      const hasStatus = (a: RawAssignment) => !!a.emailStatus && a.emailStatus !== "";

      // ── Global ────────────────────────────────────────────────────────────
      const total = assignments.length;
      const sent = assignments.filter(isSent).length;
      const failed = assignments.filter(isFailed).length;
      const noStatus = assignments.filter(a => !hasStatus(a)).length;
      const deliveryRate = sent + failed > 0
        ? Math.round((sent / (sent + failed)) * 100) : 0;

      const errorCounts = new Map<string, number>();
      for (const a of assignments.filter(isFailed)) {
        const msg = (a.emailError || "Error desconocido").slice(0, 60);
        errorCounts.set(msg, (errorCounts.get(msg) ?? 0) + 1);
      }
      const topFailReason = errorCounts.size > 0
        ? [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : "";

      setGlobalStats({ total, sent, failed, noStatus, deliveryRate, topFailReason });

      // ── Por proyecto ──────────────────────────────────────────────────────
      const projAcc = new Map<string, { name: string; total: number; sent: number; failed: number; noStatus: number }>();

      for (const a of assignments) {
        const user: any = userMap.get(a.userId);
        const pid: string =
          user?.contractInfo?.assignment?.projectId
            ? user.contractInfo.assignment.projectId
            : user?.projectIds?.[0] ?? "sin-proyecto";

        const name = projectMap.get(pid) ?? (pid === "sin-proyecto" ? "Sin cuenta analítica" : pid);
        if (!projAcc.has(pid)) projAcc.set(pid, { name, total: 0, sent: 0, failed: 0, noStatus: 0 });
        const e = projAcc.get(pid)!;
        e.total++;
        if (isSent(a)) e.sent++;
        else if (isFailed(a)) e.failed++;
        else e.noStatus++;
      }

      setByProject(
        Array.from(projAcc.entries())
          .map(([projectId, v]) => ({
            projectId,
            projectName: v.name,
            total: v.total,
            sent: v.sent,
            failed: v.failed,
            noStatus: v.noStatus,
            deliveryRate: v.sent + v.failed > 0
              ? Math.round((v.sent / (v.sent + v.failed)) * 100) : 0,
          }))
          .sort((a, b) => b.total - a.total)
      );

      // ── Por cuestionario ──────────────────────────────────────────────────
      const qAcc = new Map<string, { total: number; sent: number; failed: number }>();
      for (const a of assignments) {
        if (!qAcc.has(a.questionnaireId)) qAcc.set(a.questionnaireId, { total: 0, sent: 0, failed: 0 });
        const e = qAcc.get(a.questionnaireId)!;
        e.total++;
        if (isSent(a)) e.sent++;
        else if (isFailed(a)) e.failed++;
      }

      setByQuestionnaire(
        questionnaires.map((q: any) => {
          const v = qAcc.get(q.id) ?? { total: 0, sent: 0, failed: 0 };
          return {
            id: q.id,
            title: q.title,
            active: q.active,
            total: v.total,
            sent: v.sent,
            failed: v.failed,
            deliveryRate: v.sent + v.failed > 0
              ? Math.round((v.sent / (v.sent + v.failed)) * 100) : 0,
          };
        }).sort((a: any, b: any) => b.total - a.total)
      );

      // ── Por rol ───────────────────────────────────────────────────────────
      const roleAcc = new Map<string, { total: number; sent: number; failed: number }>();
      for (const a of assignments) {
        const role = (userMap.get(a.userId) as any)?.role ?? "desconocido";
        if (!roleAcc.has(role)) roleAcc.set(role, { total: 0, sent: 0, failed: 0 });
        const e = roleAcc.get(role)!;
        e.total++;
        if (isSent(a)) e.sent++;
        else if (isFailed(a)) e.failed++;
      }

      setByRole(
        Array.from(roleAcc.entries())
          .map(([role, v]) => ({
            role,
            total: v.total,
            sent: v.sent,
            failed: v.failed,
            deliveryRate: v.sent + v.failed > 0
              ? Math.round((v.sent / (v.sent + v.failed)) * 100) : 0,
          }))
          .sort((a, b) => b.total - a.total)
      );

      // ── Fallidos ──────────────────────────────────────────────────────────
      setFailures(
        assignments
          .filter(isFailed)
          .map(a => ({
            assignmentId: a.id,
            userName: a.userName,
            userEmail: a.userEmail,
            questionnaireTitle: (qMap.get(a.questionnaireId) as any)?.title ?? a.questionnaireId,
            assignedAt: a.assignedAt,
            error: a.emailError || "Error desconocido",
          }))
          .sort((a, b) => (b.assignedAt?.getTime() ?? 0) - (a.assignedAt?.getTime() ?? 0))
      );

      // ── Tendencia: últimos 30 días ────────────────────────────────────────
      const now = new Date();
      const days30 = new Map<string, { sent: number; failed: number }>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        days30.set(key, { sent: 0, failed: 0 });
      }

      for (const a of assignments) {
        const ref = a.lastEmailSentAt ?? a.assignedAt;
        if (!ref) continue;
        const diffDays = Math.floor((now.getTime() - ref.getTime()) / 86_400_000);
        if (diffDays < 0 || diffDays >= 30) continue;
        const key = `${String(ref.getDate()).padStart(2, "0")}/${String(ref.getMonth() + 1).padStart(2, "0")}`;
        const e = days30.get(key);
        if (!e) continue;
        if (isSent(a)) e.sent++;
        else if (isFailed(a)) e.failed++;
      }

      setTimeline(
        Array.from(days30.entries()).map(([date, v]) => ({ date, ...v }))
      );

      // ── Usuarios sin proyecto ─────────────────────────────────────────────
      const noProj = new Map<string, NoProjectUserRow>();
      for (const a of assignments) {
        const user: any = userMap.get(a.userId);
        const pid: string =
          user?.contractInfo?.assignment?.projectId
            ? user.contractInfo.assignment.projectId
            : user?.projectIds?.[0] ?? "sin-proyecto";
        if (pid !== "sin-proyecto") continue;

        if (!noProj.has(a.userId)) {
          noProj.set(a.userId, {
            userId: a.userId,
            userName: a.userName || user?.fullName || "—",
            userEmail: a.userEmail || user?.email || "—",
            role: user?.role ?? "desconocido",
            company: user?.contractInfo?.assignment?.company ?? "—",
            assignments: 0,
            sent: 0,
            failed: 0,
            questionnaires: [],
            lastActivity: null,
          });
        }
        const row = noProj.get(a.userId)!;
        row.assignments++;
        if (isSent(a)) row.sent++;
        else if (isFailed(a)) row.failed++;
        const qTitle: string = (qMap.get(a.questionnaireId) as any)?.title ?? "";
        if (qTitle && !row.questionnaires.includes(qTitle)) row.questionnaires.push(qTitle);
        const ref = a.lastEmailSentAt ?? a.assignedAt;
        if (ref && (!row.lastActivity || ref > row.lastActivity)) row.lastActivity = ref;
      }

      setNoProjectUsers(
        Array.from(noProj.values()).sort((a, b) => b.assignments - a.assignments)
      );
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return {
    loading, error, refresh: load,
    globalStats, byProject, byQuestionnaire, byRole, failures, timeline, noProjectUsers,
  };
}
