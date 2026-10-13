import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, ShieldCheck, UserMinus, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { HrExcelPreview } from '@/domain/humanResources/hrExcelPreview';

export type HrStaleActive = { id: string; fullName: string; documentNumber: string; companies: string[] };

export function HrImportPreviewDialog({
  open, onOpenChange, preview, loading, loadingLabel, error, applying, applyProgress, onApply,
  staleActives, retireStale = false, onRetireStaleChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: HrExcelPreview | null;
  loading: boolean;
  loadingLabel: string;
  error: string;
  applying: boolean;
  applyProgress: number;
  onApply: () => void;
  /** Activos en la plataforma que no están activos en el Excel (solo carga completa). */
  staleActives?: HrStaleActive[];
  retireStale?: boolean;
  onRetireStaleChange?: (value: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#008C3C]" />
            Vista previa de actualización
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-16 text-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#008C3C]" />
            {loadingLabel || 'Analizando el archivo sin modificar Firebase…'}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex gap-2">
            <XCircle className="w-5 h-5 shrink-0" /> {error}
          </div>
        )}

        {!loading && preview && (
          <div className="space-y-5">
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 flex items-center gap-2 text-sm text-green-800">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              Diagnóstico seguro: todavía no se ha escrito ningún dato en Firebase.
            </div>

            <div>
              <p className="font-semibold text-gray-800 truncate">{preview.fileName}</p>
              <p className="text-xs text-gray-400">Hoja: {preview.sheetName} · {preview.totalRows.toLocaleString('es-CO')} filas</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                ['Nuevos', preview.create, 'text-blue-700 bg-blue-50'],
                ['Por actualizar', preview.update, 'text-amber-700 bg-amber-50'],
                ['Sin cambios', preview.unchanged, 'text-green-700 bg-green-50'],
                ['Conflictos', preview.conflicts, 'text-red-700 bg-red-50'],
                ['Registros rechazados', preview.rejected, 'text-orange-700 bg-orange-50'],
                ['Sin acceso a plataforma', preview.withoutPlatformAccess, 'text-purple-700 bg-purple-50'],
              ].map(([label, value, color]) => (
                <div key={String(label)} className={`rounded-xl p-3 ${color}`}>
                  <p className="text-2xl font-bold">{Number(value).toLocaleString('es-CO')}</p>
                  <p className="text-xs font-medium">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="border rounded-xl p-3">
                <p className="font-semibold text-gray-700">Estado de las filas</p>
                <p className="text-gray-500 mt-1">Activas: <b>{preview.activeRows}</b> · Retiradas: <b>{preview.retiredRows}</b></p>
                <p className="text-gray-400 mt-1 text-xs">{preview.multiEmploymentEmployees} personas tienen varias relaciones activas válidas.</p>
              </div>
              <div className="border rounded-xl p-3">
                <p className="font-semibold text-gray-700">Historia detectada</p>
                <p className="text-gray-500 mt-1">Cédulas repetidas: <b>{preview.duplicateDocumentGroups}</b> · Correos: <b>{preview.duplicateEmailGroups}</b></p>
                {preview.invalidEmails > 0 && (
                  <p className="text-gray-400 mt-1 text-xs">{preview.invalidEmails} correos ausentes o inválidos serán conservados o no crearán acceso.</p>
                )}
              </div>
            </div>

            {(preview.dateIssues > 0 || preview.unclassifiedReasons > 0) && (
              <p className="text-xs text-gray-500">
                {preview.dateIssues > 0 && <>{preview.dateIssues} fechas opcionales no se pudieron interpretar y se conservará el valor actual. </>}
                {preview.unclassifiedReasons > 0 && <>{preview.unclassifiedReasons} motivos de retiro no están en el catálogo y quedarán como “Sin clasificar”.</>}
              </p>
            )}

            {staleActives && staleActives.length > 0 && (
              <div className="border border-rose-200 rounded-xl overflow-hidden">
                <div className="bg-rose-50 px-4 py-2 flex items-center gap-2 text-sm font-semibold text-rose-800">
                  <UserMinus className="w-4 h-4" /> Activos en la plataforma que no están activos en el Excel ({staleActives.length.toLocaleString('es-CO')})
                </div>
                <div className="max-h-44 overflow-y-auto divide-y">
                  {staleActives.slice(0, 300).map(person => (
                    <div key={person.id} className="px-4 py-1.5 text-xs flex gap-3">
                      <span className="font-mono text-gray-500 w-24 shrink-0">{person.documentNumber}</span>
                      <span className="text-gray-700 flex-1">{person.fullName}</span>
                      <span className="text-gray-400 truncate max-w-[40%]">{person.companies.join(', ')}</span>
                    </div>
                  ))}
                </div>
                <label className="flex items-start gap-2 px-4 py-3 border-t bg-white text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={retireStale} disabled={applying}
                    onChange={event => onRetireStaleChange?.(event.target.checked)} />
                  <span>
                    Marcar estas {staleActives.length.toLocaleString('es-CO')} personas como <b>retiradas</b> al aplicar.
                    <span className="block text-xs text-gray-400">
                      Sus relaciones activas pasan a retiradas sin fecha de retiro y con motivo “Sin clasificar”. La decisión queda registrada en el historial de importaciones.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {preview.issues.length > 0 && (
              <div className="border border-amber-200 rounded-xl overflow-hidden">
                <div className="bg-amber-50 px-4 py-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <AlertTriangle className="w-4 h-4" /> Filas que requieren revisión
                </div>
                <div className="max-h-52 overflow-y-auto divide-y">
                  {preview.issues.slice(0, 100).map((issue, index) => (
                    <div
                      key={`${issue.row}-${index}`}
                      className={`px-4 py-2 text-xs flex gap-3 ${
                        issue.action === 'conflict' ? 'bg-red-50' : issue.action === 'rejected' ? 'bg-orange-50' : ''
                      }`}
                    >
                      <span className="font-mono font-semibold text-gray-600 w-16">Fila {issue.row}</span>
                      <span className={issue.action === 'conflict' ? 'font-semibold text-red-700' : issue.action === 'rejected' ? 'font-medium text-orange-700' : 'text-gray-500'}>
                        {issue.reasons.join(' · ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> La importación es repetible y no crea cuentas de acceso automáticamente.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={applying} onClick={() => onOpenChange(false)}>Cerrar</Button>
                <Button
                  className="bg-[#008C3C] hover:bg-[#006C2F] text-white"
                  disabled={applying || preview.conflicts > 0 || preview.rejected > 0}
                  onClick={onApply}
                >
                  {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  {applying ? `${applyProgress}%` : 'Aplicar en Firebase'}
                </Button>
              </div>
            </div>
            {applying && (
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#008C3C] transition-all" style={{ width: `${applyProgress}%` }} />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
