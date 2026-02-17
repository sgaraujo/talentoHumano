// src/pages/ExporterPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { useOnboardingExportTabs } from "@/hooks/useOnboardingExportTabs";
import { questionnaireService } from "@/services/questionnaireService";

import { db } from "@/config/firebase";
import { doc, getDoc } from "firebase/firestore";

import type { Questionnaire } from "@/models/types/Questionnaire";

type QueueRow = {
  id: string;
  questionnaireId: string;
  userId: string;
  answers: Record<string, any>;
  status: "pending" | "completed";
  completedAt: any; // Date | Timestamp | string
  exported?: boolean | null;
  exportError?: string;
};

function toDateStr(value: any) {
  try {
    if (!value) return "";
    if (value instanceof Date) return value.toLocaleString();
    if (value?.toDate) return value.toDate().toLocaleString(); // Firestore Timestamp
    return new Date(value).toLocaleString();
  } catch {
    return String(value ?? "");
  }
}

function formatCellValue(v: any) {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ExcelLikeTable({
  questionnaireId,
  questionnaireTitle,
}: {
  questionnaireId: string;
  questionnaireTitle: string;
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);

  // uid -> { fullName, email }
  const [userMap, setUserMap] = useState<Record<string, { fullName?: string; email?: string }>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const q = await questionnaireService.getById(questionnaireId);
      setQuestionnaire(q);

      const data = await questionnaireService.getExportQueueByQuestionnaire(questionnaireId, 500);
      setRows(data as any);

      const uids = Array.from(new Set((data as any[]).map((r) => r.userId).filter(Boolean)));
      const entries = await Promise.all(
        uids.map(async (uid) => {
          const snap = await getDoc(doc(db, "users", uid));
          const d: any = snap.exists() ? snap.data() : null;
          return [uid, { fullName: d?.fullName, email: d?.email }] as const;
        })
      );
      setUserMap(Object.fromEntries(entries));
    } catch (e: any) {
      toast.error("No se pudo cargar la información", { description: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionnaireId]);

  // Preguntas (ordenadas) -> columnas
  const columns = useMemo(() => {
    const qs = questionnaire?.questions?.slice()?.sort((a, b) => a.order - b.order) ?? [];
    return qs.map((qq) => ({
      id: qq.id,
      header: qq.text,
    }));
  }, [questionnaire]);

  // Filtrar a "completed" (para que sea tipo Excel real, solo respondidos)
  const completedRows = useMemo(() => {
    return rows.filter((r) => r.status === "completed");
  }, [rows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{questionnaireTitle}</CardTitle>
          <CardDescription>
            Filas: <b>{completedRows.length}</b> • Columnas (preguntas): <b>{columns.length}</b>
          </CardDescription>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refrescar
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading && completedRows.length === 0 ? (
          <div className="py-10 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando...
          </div>
        ) : completedRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No hay respuestas completadas para mostrar.
          </div>
        ) : (
          <div className="w-full overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="text-left">
                  <th className="p-3 whitespace-nowrap">Nombre</th>
                  <th className="p-3 whitespace-nowrap">Correo</th>
                  <th className="p-3 whitespace-nowrap">Fecha</th>

                  {columns.map((c) => (
                    <th key={c.id} className="p-3 min-w-[280px]">
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {completedRows.map((r) => {
                  const fullName = userMap[r.userId]?.fullName ?? "Sin nombre";
                  const email = userMap[r.userId]?.email ?? "";
                  const dateStr = toDateStr(r.completedAt);

                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-3 whitespace-nowrap font-medium">{fullName}</td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{email || r.userId}</td>
                      <td className="p-3 whitespace-nowrap">{dateStr}</td>

                      {columns.map((c) => (
                        <td key={c.id} className="p-3 align-top">
                          {formatCellValue(r.answers?.[c.id])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExporterPage() {
  const { loading, error, questionnaires, refresh } = useOnboardingExportTabs();
  const defaultTab = questionnaires?.[0]?.id;

  if (loading && questionnaires.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando cuestionarios...
      </div>
    );
  }

  return (
    <div className="p-4">
      {error && (
        <div className="mb-4 rounded-lg border p-3 text-sm">
          <b>Error:</b> {error}{" "}
          <Button variant="outline" size="sm" className="ml-2" onClick={refresh}>
            Reintentar
          </Button>
        </div>
      )}

      {questionnaires.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Exportador</CardTitle>
            <CardDescription>No hay cuestionarios onboarding creados.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            {questionnaires.map((q) => (
              <TabsTrigger key={q.id} value={q.id}>
                {q.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {questionnaires.map((q) => (
            <TabsContent key={q.id} value={q.id} className="mt-4">
              <ExcelLikeTable questionnaireId={q.id} questionnaireTitle={q.title} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
