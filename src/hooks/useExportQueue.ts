import { useEffect, useMemo, useState } from "react";
import { exportQueueService } from "@/services/exportQueueService";

export type ExportRow = {
  questionnaireId: string;
  title: string;
  pending: number;
  exportedOk: number;
  errors: number;
  lastError?: string;
  items: any[];
};

export const useExportQueue = () => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await exportQueueService.getPendingOnboardingQueue(300);
      setItems(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // agrupar por cuestionario
  const rows: ExportRow[] = useMemo(() => {
    const map = new Map<string, ExportRow>();

    for (const item of items) {
      const q = item.questionnaire;
      const r = item.response;

      if (!map.has(q.id)) {
        map.set(q.id, {
          questionnaireId: q.id,
          title: q.title,
          pending: 0,
          exportedOk: 0,
          errors: 0,
          lastError: "",
          items: [],
        });
      }

      const row = map.get(q.id)!;
      row.items.push(item);

      // en la cola solo llegan exported false/null, pero igual dejamos robusto
      if (r.exportError && String(r.exportError).trim()) {
        row.errors += 1;
        row.lastError = String(r.exportError);
      } else {
        row.pending += 1;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.pending - a.pending);
  }, [items]);

  const exportPendingForQuestionnaire = async (row: ExportRow) => {
    setLoading(true);
    try {
      // exporta solo los que no tienen error (pendientes limpios)
      const targets = row.items.filter((it: any) => !it.response.exportError);
      for (const it of targets) {
        await exportQueueService.exportOne(it);
      }
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const retryErrorsForQuestionnaire = async (row: ExportRow) => {
    setLoading(true);
    try {
      const targets = row.items.filter((it: any) => !!it.response.exportError);
      for (const it of targets) {
        await exportQueueService.exportOne(it);
      }
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, rows, refresh, exportPendingForQuestionnaire, retryErrorsForQuestionnaire };
};
