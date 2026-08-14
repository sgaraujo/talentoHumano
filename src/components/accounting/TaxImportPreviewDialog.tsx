import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KNOWN_TAX_TYPES, VALID_STATUSES, type TaxImportPlan } from '@/domain/tax/taxExcelImport';

export function TaxImportPreviewDialog({
  open, onOpenChange, plan, loading, error, applying, onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: TaxImportPlan | null;
  loading: boolean;
  error: string;
  applying: boolean;
  onApply: () => void;
}) {
  const issueRows = plan?.rows.filter(row => row.reasons.length > 0) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#008C3C]" />
            Vista previa de vencimientos
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-16 text-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#008C3C]" />
            Analizando el archivo sin modificar Firebase…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex gap-2">
            <XCircle className="w-5 h-5 shrink-0" /> {error}
          </div>
        )}

        {!loading && plan && (
          <div className="space-y-5">
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 flex items-center gap-2 text-sm text-green-800">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              Diagnóstico seguro: todavía no se ha escrito ningún dato en Firebase.
            </div>

            <div>
              <p className="font-semibold text-gray-800 truncate">{plan.fileName}</p>
              <p className="text-xs text-gray-400">{plan.totalRows.toLocaleString('es-CO')} filas leídas</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                ['Nuevos', plan.create, 'text-blue-700 bg-blue-50'],
                ['Por actualizar', plan.update, 'text-amber-700 bg-amber-50'],
                ['Sin cambios', plan.unchanged, 'text-green-700 bg-green-50'],
                ['Conflictos', plan.conflicts, 'text-red-700 bg-red-50'],
                ['Rechazados', plan.rejected, 'text-orange-700 bg-orange-50'],
              ].map(([label, value, color]) => (
                <div key={String(label)} className={`rounded-xl p-3 ${color}`}>
                  <p className="text-2xl font-bold">{Number(value).toLocaleString('es-CO')}</p>
                  <p className="text-xs font-medium">{label}</p>
                </div>
              ))}
            </div>

            {issueRows.length > 0 && (
              <div className="border border-amber-200 rounded-xl overflow-hidden">
                <div className="bg-amber-50 px-4 py-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <AlertTriangle className="w-4 h-4" /> Filas que requieren revisión
                </div>
                <div className="max-h-52 overflow-y-auto divide-y">
                  {issueRows.slice(0, 100).map((row, index) => (
                    <div
                      key={`${row.sourceRow}-${index}`}
                      className={`px-4 py-2 text-xs flex gap-3 ${
                        row.action === 'conflict' ? 'bg-red-50' : row.action === 'rejected' ? 'bg-orange-50' : ''
                      }`}
                    >
                      <span className="font-mono font-semibold text-gray-600 w-16 flex-shrink-0">Fila {row.sourceRow}</span>
                      <span className={row.action === 'conflict' ? 'font-semibold text-red-700' : row.action === 'rejected' ? 'font-medium text-orange-700' : 'text-gray-500'}>
                        {row.reasons.join(' · ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {plan.rejected > 0 && (
              <div className="rounded-xl border border-gray-200 p-3 text-xs text-gray-500">
                <p className="font-semibold text-gray-600 mb-1.5">Valores válidos, para corregir el archivo:</p>
                <p className="mb-1"><span className="font-medium text-gray-600">Tipo de obligación:</span> {KNOWN_TAX_TYPES.join(', ')} — o cualquiera ya existente en el calendario.</p>
                <p><span className="font-medium text-gray-600">Estado:</span> {VALID_STATUSES.join(', ')}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Nunca sobrescribe el estado de un vencimiento existente.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={applying} onClick={() => onOpenChange(false)}>Cerrar</Button>
                <Button
                  className="bg-[#008C3C] hover:bg-[#006C2F] text-white"
                  disabled={applying || plan.conflicts > 0 || plan.rejected > 0 || (plan.create === 0 && plan.update === 0)}
                  onClick={onApply}
                >
                  {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  {applying ? 'Aplicando…' : 'Aplicar en Firebase'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
