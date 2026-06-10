import { useCallback, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/config/firebase";

interface RawAssignment {
  id: string;
  questionnaireId: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: "pending" | "completed";
  assignedAt: Date | null;
  completedAt: Date | null;
  responseId?: string;
}

interface RawQuestionnaire {
  id: string;
  title: string;
  active: boolean;
  targetRole?: string;
}

interface RawUser {
  id: string;
  role: string;
  projectIds?: string[];
  contractInfo?: { assignment?: { projectId?: string } };
}

export interface QuestionnaireStatRow {
  id: string;
  title: string;
  active: boolean;
  assigned: number;
  completed: number;
  pending: number;
  rate: number;
  avgDays: number | null;
}

export interface RoleStatRow {
  role: string;
  assigned: number;
  completed: number;
  rate: number;
}

export interface ProjectStatRow {
  projectId: string;
  projectName: string;
  assigned: number;
  completed: number;
  rate: number;
}

export interface TimelinePoint {
  date: string;
  completions: number;
}

export interface PendingAlert {
  userId: string;
  userName: string;
  userEmail: string;
  days: number;
  questionnaires: string[];
}

export interface GlobalStats {
  totalQuestionnaires: number;
  activeQuestionnaires: number;
  totalAssigned: number;
  totalCompleted: number;
  globalRate: number;
  totalPending: number;
}

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const realCompleted = (a: RawAssignment) =>
  a.status === "completed" && !!a.responseId;

export function useQuestionnaireStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalQuestionnaires: 0,
    activeQuestionnaires: 0,
    totalAssigned: 0,
    totalCompleted: 0,
    globalRate: 0,
    totalPending: 0,
  });
  const [byQuestionnaire, setByQuestionnaire] = useState<QuestionnaireStatRow[]>([]);
  const [byRole, setByRole] = useState<RoleStatRow[]>([]);
  const [byProject, setByProject] = useState<ProjectStatRow[]>([]);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<PendingAlert[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [qSnap, aSnap, uSnap, pSnap] = await Promise.all([
        getDocs(collection(db, "questionnaires")),
        getDocs(collection(db, "questionnaire_assignments")),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "projects")),
      ]);

      const questionnaires: RawQuestionnaire[] = qSnap.docs.map(d => ({
        id: d.id,
        ...(d.data() as any),
      }));

      const assignments: RawAssignment[] = aSnap.docs.map(d => {
        const x: any = d.data();
        return {
          id: d.id,
          questionnaireId: x.questionnaireId ?? "",
          userId: x.userId ?? "",
          userEmail: x.userEmail ?? "",
          userName: x.userName ?? "",
          status: x.status,
          assignedAt: toDate(x.assignedAt),
          completedAt: toDate(x.completedAt),
          responseId: x.responseId,
        };
      });

      const users: RawUser[] = uSnap.docs.map(d => ({
        id: d.id,
        ...(d.data() as any),
      }));

      const projects = pSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      const userMap = new Map(users.map(u => [u.id, u]));
      const projectMap = new Map<string, string>(projects.map(p => [p.id, p.name]));
      const qMap = new Map(questionnaires.map(q => [q.id, q]));

      const now = new Date();

      // ── Global ────────────────────────────────────────────────────────────
      const totalAssigned = assignments.length;
      const totalCompleted = assignments.filter(realCompleted).length;
      const totalPending = assignments.filter(a => a.status === "pending").length;
      setGlobalStats({
        totalQuestionnaires: questionnaires.length,
        activeQuestionnaires: questionnaires.filter(q => q.active).length,
        totalAssigned,
        totalCompleted,
        globalRate:
          totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0,
        totalPending,
      });

      // ── Por cuestionario ──────────────────────────────────────────────────
      const byQ: QuestionnaireStatRow[] = questionnaires
        .map(q => {
          const qa = assignments.filter(a => a.questionnaireId === q.id);
          const compl = qa.filter(realCompleted);
          const pend = qa.filter(a => a.status === "pending");

          const daysArr = compl
            .filter(a => a.assignedAt && a.completedAt)
            .map(
              a =>
                (a.completedAt!.getTime() - a.assignedAt!.getTime()) / 86_400_000
            );
          const avgDays =
            daysArr.length > 0
              ? Math.round(daysArr.reduce((s, d) => s + d, 0) / daysArr.length)
              : null;

          return {
            id: q.id,
            title: q.title,
            active: q.active,
            assigned: qa.length,
            completed: compl.length,
            pending: pend.length,
            rate:
              qa.length > 0 ? Math.round((compl.length / qa.length) * 100) : 0,
            avgDays,
          };
        })
        .sort((a, b) => b.assigned - a.assigned);
      setByQuestionnaire(byQ);

      // ── Por rol ───────────────────────────────────────────────────────────
      const roleAcc = new Map<string, { assigned: number; completed: number }>();
      for (const a of assignments) {
        const role = userMap.get(a.userId)?.role ?? "desconocido";
        if (!roleAcc.has(role)) roleAcc.set(role, { assigned: 0, completed: 0 });
        const e = roleAcc.get(role)!;
        e.assigned++;
        if (realCompleted(a)) e.completed++;
      }
      setByRole(
        Array.from(roleAcc.entries())
          .map(([role, v]) => ({
            role,
            assigned: v.assigned,
            completed: v.completed,
            rate:
              v.assigned > 0
                ? Math.round((v.completed / v.assigned) * 100)
                : 0,
          }))
          .sort((a, b) => b.assigned - a.assigned)
      );

      // ── Por proyecto ──────────────────────────────────────────────────────
      const projAcc = new Map<string, { name: string; assigned: number; completed: number }>();

      for (const a of assignments) {
        const user = userMap.get(a.userId);
        const pids: string[] =
          user?.projectIds?.length
            ? user.projectIds
            : user?.contractInfo?.assignment?.projectId
            ? [user.contractInfo.assignment.projectId]
            : ["sin-proyecto"];

        for (const pid of pids) {
          const name =
            projectMap.get(pid) ?? (pid === "sin-proyecto" ? "Sin proyecto" : pid);
          if (!projAcc.has(pid)) projAcc.set(pid, { name, assigned: 0, completed: 0 });
          const e = projAcc.get(pid)!;
          e.assigned++;
          if (realCompleted(a)) e.completed++;
        }
      }
      setByProject(
        Array.from(projAcc.entries())
          .map(([projectId, v]) => ({
            projectId,
            projectName: v.name,
            assigned: v.assigned,
            completed: v.completed,
            rate:
              v.assigned > 0
                ? Math.round((v.completed / v.assigned) * 100)
                : 0,
          }))
          .sort((a, b) => b.assigned - a.assigned)
      );

      // ── Tendencia (últimos 30 días, por día) ──────────────────────────────
      const days30 = new Map<string, number>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = `${String(d.getDate()).padStart(2, "0")}/${String(
          d.getMonth() + 1
        ).padStart(2, "0")}`;
        days30.set(key, 0);
      }
      for (const a of assignments) {
        if (!realCompleted(a) || !a.completedAt) continue;
        const diffDays = Math.floor(
          (now.getTime() - a.completedAt.getTime()) / 86_400_000
        );
        if (diffDays >= 0 && diffDays < 30) {
          const d = a.completedAt;
          const key = `${String(d.getDate()).padStart(2, "0")}/${String(
            d.getMonth() + 1
          ).padStart(2, "0")}`;
          days30.set(key, (days30.get(key) ?? 0) + 1);
        }
      }
      setTimeline(
        Array.from(days30.entries()).map(([date, completions]) => ({
          date,
          completions,
        }))
      );

      // ── Alertas de pendientes (≥ 3 días sin responder) ───────────────────
      const alertMap = new Map<
        string,
        { userName: string; userEmail: string; days: number; questionnaires: string[] }
      >();
      for (const a of assignments) {
        if (a.status !== "pending" || !a.assignedAt) continue;
        const daysPending = Math.floor(
          (now.getTime() - a.assignedAt.getTime()) / 86_400_000
        );
        if (daysPending < 3) continue;
        const qTitle = qMap.get(a.questionnaireId)?.title ?? a.questionnaireId;

        if (!alertMap.has(a.userId)) {
          alertMap.set(a.userId, {
            userName: a.userName,
            userEmail: a.userEmail,
            days: daysPending,
            questionnaires: [],
          });
        }
        const e = alertMap.get(a.userId)!;
        e.days = Math.max(e.days, daysPending);
        e.questionnaires.push(qTitle);
      }
      setPendingAlerts(
        Array.from(alertMap.entries())
          .map(([userId, v]) => ({ userId, ...v }))
          .sort((a, b) => b.days - a.days)
      );
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    loading,
    error,
    globalStats,
    byQuestionnaire,
    byRole,
    byProject,
    timeline,
    pendingAlerts,
    refresh: load,
  };
}
