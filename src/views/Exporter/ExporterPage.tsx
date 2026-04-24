import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Download, ClipboardList, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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
  completedAt: any;
  exported?: boolean | null;
  exportError?: string;
};

function toDateStr(value: any) {
  try {
    if (!value) return "";
    if (value instanceof Date) return value.toLocaleString("es-CO");
    if (value?.toDate) return value.toDate().toLocaleString("es-CO");
    return new Date(value).toLocaleString("es-CO");
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

function ResponseTable({
  questionnaireId,
  questionnaireTitle,
}: {
  questionnaireId: string;
  questionnaireTitle: string;
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
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
      toast.error("No se pudo cargar la información", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [questionnaireId]);

  const columns = useMemo(() => {
    const qs = questionnaire?.questions?.slice()?.sort((a, b) => a.order - b.order) ?? [];
    return qs.map((qq) => ({ id: qq.id, header: qq.text }));
  }, [questionnaire]);

  const completedRows = useMemo(() => rows.filter((r) => r.status === "completed"), [rows]);

  const handleDownload = () => {
    if (completedRows.length === 0) {
      toast.error("No hay datos para exportar");
      return;
    }

    const headers = ["Nombre", "Correo", "Fecha respuesta", ...columns.map((c) => c.header)];
    const data = completedRows.map((r) => [
      userMap[r.userId]?.fullName ?? "Sin nombre",
      userMap[r.userId]?.email ?? r.userId,
      toDateStr(r.completedAt),
      ...columns.map((c) => formatCellValue(r.answers?.[c.id])),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

    // Estilo del encabezado
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { fgColor: { rgb: "008C3C" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        bottom: { style: "thin", color: { rgb: "006C2F" } },
        right: { style: "thin", color: { rgb: "006C2F" } },
      },
    };
    const cellStyle = {
      alignment: { vertical: "top", wrapText: true },
      border: {
        bottom: { style: "thin", color: { rgb: "E5E7EB" } },
        right: { style: "thin", color: { rgb: "E5E7EB" } },
      },
    };

    headers.forEach((_, i) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    });

    data.forEach((_, ri) => {
      headers.forEach((_, ci) => {
        const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
        if (ws[cellRef]) ws[cellRef].s = cellStyle;
      });
    });

    // Anchos de columna
    ws["!cols"] = headers.map((h, i) => ({
      wch: i < 3 ? (i === 2 ? 22 : 28) : Math.max(h.length + 4, 20),
    }));
    ws["!rows"] = [{ hpt: 30 }]; // altura encabezado

    const wb = XLSX.utils.book_new();
    wb.Props = {
      Title: questionnaireTitle,
      Author: "Inteegrados",
      Company: "Triangulum",
    };
    XLSX.utils.book_append_sheet(wb, ws, "Respuestas");

    // Hoja de metadatos
    const meta = XLSX.utils.aoa_to_sheet([
      ["Cuestionario", questionnaireTitle],
      ["Exportado por", "Inteegrados · Triangulum"],
      ["Fecha de exportación", new Date().toLocaleString("es-CO")],
      ["Total de respuestas", completedRows.length],
    ]);
    XLSX.utils.book_append_sheet(wb, meta, "Info");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Respuestas_${questionnaireTitle.replace(/\s+/g, "_")}_${date}.xlsx`);
    toast.success("Excel descargado correctamente");
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Respuestas", value: completedRows.length, color: "text-[#008C3C]" },
          { label: "Preguntas", value: columns.length, color: "text-blue-600" },
          { label: "Pendientes", value: rows.filter(r => r.status === "pending").length, color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          {completedRows.length === 0
            ? "Sin respuestas aún"
            : `${completedRows.length} respuesta${completedRows.length !== 1 ? "s" : ""} completada${completedRows.length !== 1 ? "s" : ""}`}
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}
            className="border-gray-200 text-gray-600 hover:text-[#008C3C] hover:border-[#008C3C]/30">
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" />
              : <RefreshCw className="h-4 w-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">Refrescar</span>
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={loading || completedRows.length === 0}
            className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
            <Download className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Descargar Excel</span>
            <span className="sm:hidden">Excel</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading && completedRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 flex items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin text-[#008C3C]" />
          Cargando respuestas...
        </div>
      ) : completedRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No hay respuestas completadas aún</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <p className="sm:hidden text-[10px] text-gray-400 text-center py-1.5 border-b border-gray-50 bg-gray-50">
            ← Desliza para ver todas las columnas →
          </p>
          <div className="overflow-auto max-h-[55vh]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#008C3C] text-white text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left whitespace-nowrap font-semibold">Nombre</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap font-semibold">Correo</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap font-semibold">Fecha</th>
                  {columns.map((c) => (
                    <th key={c.id} className="px-4 py-3 text-left min-w-[220px] font-semibold">
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {completedRows.map((r, idx) => {
                  const fullName = userMap[r.userId]?.fullName ?? "Sin nombre";
                  const email = userMap[r.userId]?.email ?? "";
                  return (
                    <tr key={r.id}
                      className={`border-t border-gray-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-[#008C3C]/5 transition-colors`}>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-[#4A4A4A]">{fullName}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">{email || r.userId}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs">{toDateStr(r.completedAt)}</td>
                      {columns.map((c) => (
                        <td key={c.id} className="px-4 py-3 align-top text-gray-600">
                          {formatCellValue(r.answers?.[c.id])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExporterPage() {
  const { loading, error, questionnaires, refresh } = useOnboardingExportTabs();
  const [selectedId, setSelectedId] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (questionnaires.length > 0 && !selectedId) {
      setSelectedId(questionnaires[0].id);
    }
  }, [questionnaires]);

  const selected = questionnaires.find(q => q.id === selectedId);

  if (loading && questionnaires.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-2 text-sm text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin text-[#008C3C]" />
        Cargando cuestionarios...
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-5">

      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#008C3C] flex items-center justify-center shadow-sm">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#4A4A4A]">Exportador de respuestas</h1>
          <p className="text-xs text-gray-400">Descarga las respuestas de los cuestionarios en Excel</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={refresh} className="border-red-200 text-red-600">
            Reintentar
          </Button>
        </div>
      )}

      {questionnaires.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-20 text-center">
          <ClipboardList className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-400">No hay cuestionarios activos</p>
          <p className="text-xs text-gray-300 mt-1">Crea un cuestionario en el módulo de Cuestionarios</p>
        </div>
      ) : (
        <>
          {/* Questionnaire selector */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Cuestionario
            </p>

            {/* Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(o => !o)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white hover:border-[#008C3C]/40 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-[#008C3C] flex-shrink-0" />
                  <span className="font-medium text-[#4A4A4A] text-sm truncate">
                    {selected?.title ?? "Selecciona un cuestionario"}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden">
                  {questionnaires.map(q => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => { setSelectedId(q.id); setDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors
                        ${q.id === selectedId
                          ? "bg-[#008C3C]/5 text-[#008C3C] font-semibold"
                          : "text-gray-700 hover:bg-gray-50"}`}
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${q.id === selectedId ? "bg-[#008C3C]" : "bg-gray-200"}`} />
                      {q.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Table */}
          {selectedId && (
            <ResponseTable
              key={selectedId}
              questionnaireId={selectedId}
              questionnaireTitle={selected?.title ?? ""}
            />
          )}
        </>
      )}
    </div>
  );
}
