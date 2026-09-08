import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BriefcaseBusiness, CheckCircle2, Download, FileClock, Loader2, RefreshCw, Search, Upload, UserPlus, UserRoundX, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getHrControlData, type HrControlEmployee, type HrImportRunSummary, type HrRelationshipRow } from '@/services/hrControlService';
import { HrImportPreviewDialog } from '@/components/users/HrImportPreviewDialog';
import type { HrExcelPreview } from '@/domain/humanResources/hrExcelPreview';
import { runHrExcelImportPlan, runHrExcelPreview } from '@/domain/humanResources/runHrExcelPreview';
import { applyHrImport } from '@/services/hrImportService';
import { useUsers } from '@/hooks/useUsers';
import { auth } from '@/config/firebase';
import { toast } from 'sonner';
import { HrEmployeeDetailDialog } from '@/components/users/HrEmployeeDetailDialog';
import { HrPartialUpdateDialog } from '@/components/users/HrPartialUpdateDialog';
import { HrCreateEmployeeDialog } from '@/components/users/HrCreateEmployeeDialog';

const dateLabel = (value: any) => value?.toDate?.().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) ?? '—';

export function HrControlPage() {
  const [employees, setEmployees] = useState<HrControlEmployee[]>([]);
  const [runs, setRuns] = useState<HrImportRunSummary[]>([]);
  const [relationshipRows, setRelationshipRows] = useState<HrRelationshipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'retired' | 'without_access' | 'multiple'>('all');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<HrExcelPreview | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewLabel, setPreviewLabel] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const { users: platformUsers } = useUsers();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [partialUpdateOpen, setPartialUpdateOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await getHrControlData();
      setEmployees(data.employees); setRuns(data.runs); setRelationshipRows(data.relationshipRows);
    } catch (reason: any) {
      setError(reason?.message || 'No fue posible consultar los expedientes.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const selectExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportFile(file); setPreviewOpen(true); setPreview(null); setPreviewError(''); setPreviewLoading(true);
    try { setPreview(await runHrExcelPreview(file, platformUsers, setPreviewLabel)); }
    catch (reason: any) { setPreviewError(reason?.message || 'No fue posible analizar el archivo.'); }
    finally { setPreviewLoading(false); }
  };

  const applyImport = async () => {
    if (!importFile || !preview || preview.conflicts || preview.rejected) return;
    if (!window.confirm(`Se actualizarán ${preview.totalRows.toLocaleString('es-CO')} relaciones laborales. ¿Deseas continuar?`)) return;
    setApplying(true); setApplyProgress(0); setPreviewError('');
    try {
      const plan = await runHrExcelImportPlan(importFile, platformUsers, setPreviewLabel);
      const result = await applyHrImport(plan, auth.currentUser?.email || 'usuario-desconocido', (percent, label) => { setApplyProgress(percent); setPreviewLabel(label); });
      toast.success('Base de Talento Humano actualizada', { description: `${result.employees} expedientes y ${result.relationships} relaciones procesadas.` });
      setPreviewOpen(false); await load();
    } catch (reason: any) {
      setPreviewError(reason?.message || 'No fue posible aplicar la importación.');
      toast.error('La actualización no se completó');
    } finally { setApplying(false); }
  };

  const handleDownloadDatabase = () => {
    if (relationshipRows.length === 0) { toast.error('No hay relaciones para descargar'); return; }
    const rows = relationshipRows.map(r => ({
      Documento: r.documentNumber,
      Nombre: r.fullName,
      'Estado empleado': r.employeeStatus,
      'Correo corporativo': r.corporateEmail || '',
      'Correo personal': r.personalEmail || '',
      'Teléfono corporativo': r.corporatePhone || '',
      'Teléfono personal': r.personalPhone || '',
      Empresa: r.companyName || '',
      'Cuenta analítica': r.projectName || '',
      Cargo: r.position || '',
      'Tipo de contrato': r.contractType || '',
      Modalidad: r.modality || '',
      Regional: r.regional || '',
      Sede: r.baseLocation || '',
      Área: r.area || '',
      'Fecha inicio': r.startDate || '',
      'Fecha fin': r.endDate || '',
      'Estado relación': r.relationshipStatus,
      'Motivo de retiro': r.terminationReason || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(key => ({ wch: Math.max(key.length + 2, 16) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Talento Humano');
    XLSX.writeFile(wb, `BD_Talento_Humano_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const withoutAccess = employees.filter(item => !item.identityUserId).length;
  const activeRelationships = employees.reduce((total, item) => total + item.activeRelations, 0);
  const multiple = employees.filter(item => item.activeRelations > 1).length;
  const latestRun = runs[0];
  const filtered = useMemo(() => employees.filter(item => {
    if (filter === 'active' && item.activeRelations === 0) return false;
    if (filter === 'retired' && (item.status !== 'retired' || item.activeRelations > 0)) return false;
    if (filter === 'without_access' && item.identityUserId) return false;
    if (filter === 'multiple' && item.activeRelations < 2) return false;
    const term = search.trim().toLowerCase();
    return !term || [item.fullName, item.documentNumber, ...item.companies, ...item.projects]
      .some(value => value.toLowerCase().includes(term));
  }), [employees, filter, search]);

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Expedientes y control</h1>
          <p className="text-sm text-gray-500 mt-1">Validación de la base canónica de Talento Humano</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}Actualizar
          </Button>
          <Button className="bg-[#008C3C] hover:bg-[#006C2F]" onClick={() => setCreateOpen(true)}>
            <UserPlus className="w-4 h-4 mr-2" />Nueva persona
          </Button>
          <label className="inline-flex items-center rounded-md bg-[#008C3C] hover:bg-[#006C2F] text-white px-4 py-2 text-sm font-medium cursor-pointer">
            <Upload className="w-4 h-4 mr-2" />Actualizar desde Excel
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={selectExcel} />
          </label>
          <Button variant="outline" onClick={() => setPartialUpdateOpen(true)}><FileClock className="w-4 h-4 mr-2" />Actualización parcial</Button>
        </div>
      </div>

      {error && <div className="border border-red-200 bg-red-50 text-red-700 rounded-xl p-3 flex gap-2 text-sm"><AlertCircle className="w-5 h-5" />{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Expedientes', employees.length, Users, 'bg-blue-50 text-blue-700'],
          ['Relaciones activas', activeRelationships, BriefcaseBusiness, 'bg-green-50 text-green-700'],
          ['Sin acceso', withoutAccess, UserRoundX, 'bg-purple-50 text-purple-700'],
          ['Vínculo múltiple', multiple, CheckCircle2, 'bg-amber-50 text-amber-700'],
        ].map(([label, value, Icon, color]: any) => (
          <div key={label} className={`rounded-xl border border-white p-4 ${color}`}>
            <Icon className="w-5 h-5 mb-2" /><p className="text-2xl font-bold">{Number(value).toLocaleString('es-CO')}</p><p className="text-xs font-medium">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border rounded-xl p-4 flex items-start gap-3">
        <FileClock className="w-5 h-5 text-[#008C3C] mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-gray-700">Última importación</p>
          {latestRun ? <p className="text-sm text-gray-500 mt-1">{latestRun.fileName} · <b className={latestRun.status === 'completed' ? 'text-green-600' : 'text-amber-600'}>{latestRun.status}</b> · {dateLabel(latestRun.completedAt || latestRun.createdAt)} · {latestRun.relationshipCount ?? 0} relaciones</p>
            : <p className="text-sm text-gray-400 mt-1">No hay ejecuciones registradas.</p>}
        </div>
        <Button variant="outline" size="sm" onClick={handleDownloadDatabase} disabled={relationshipRows.length === 0} className="flex-shrink-0">
          <Download className="w-4 h-4 mr-2" />Descargar base ({relationshipRows.length.toLocaleString('es-CO')})
        </Button>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="p-4 border-b space-y-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input className="pl-9" placeholder="Buscar nombre, cédula, empresa o cuenta analítica…" value={search} onChange={event => setSearch(event.target.value)} /></div>
          <div className="flex gap-2 flex-wrap">
            {([['all','Todos'],['active','Activos'],['retired','Retirados'],['without_access','Sin acceso'],['multiple','Vínculo múltiple']] as const).map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filter === value ? 'bg-[#008C3C] border-[#008C3C] text-white' : 'bg-white text-gray-500 border-gray-200'}`}>{label}</button>)}
          </div>
        </div>
        {loading ? <div className="py-16 text-center text-gray-400"><Loader2 className="w-7 h-7 animate-spin mx-auto mb-2" />Cargando expedientes…</div> : (
          <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
            <table className="w-full text-sm"><thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-3">Persona</th><th className="px-4 py-3">Cédula</th><th className="px-4 py-3">Empresa / cuenta analítica</th><th className="px-4 py-3">Relaciones</th><th className="px-4 py-3">Acceso</th></tr></thead>
              <tbody className="divide-y">{filtered.slice(0, 1000).map(item => <tr key={item.id} onClick={() => setSelectedEmployeeId(item.id)} className="hover:bg-green-50/60 cursor-pointer transition-colors" title="Abrir expediente"><td className="px-4 py-3 font-medium text-gray-700">{item.fullName}</td><td className="px-4 py-3 font-mono text-xs text-gray-500">{item.documentNumber}</td><td className="px-4 py-3 text-gray-500"><p>{item.companies.join(', ') || '—'}</p><p className="text-xs text-gray-400">{item.projects.join(', ') || 'Sin cuenta analítica'}</p></td><td className="px-4 py-3"><span className="text-green-700">{item.activeRelations} activas</span><span className="text-gray-400"> · {item.retiredRelations} históricas</span></td><td className="px-4 py-3">{item.identityUserId ? <span className="text-green-700 bg-green-50 px-2 py-1 rounded-full text-xs">Vinculado</span> : <span className="text-purple-700 bg-purple-50 px-2 py-1 rounded-full text-xs">Sin acceso</span>}</td></tr>)}</tbody>
            </table>
            {filtered.length === 0 && <p className="text-center py-12 text-gray-400">No hay resultados con estos filtros.</p>}
          </div>
        )}
      </div>
      <HrImportPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} preview={preview} loading={previewLoading} loadingLabel={previewLabel} error={previewError} applying={applying} applyProgress={applyProgress} onApply={applyImport} />
      <HrEmployeeDetailDialog employeeId={selectedEmployeeId} open={!!selectedEmployeeId} onOpenChange={open => { if (!open) setSelectedEmployeeId(null); }} onUpdated={load} />
      <HrPartialUpdateDialog open={partialUpdateOpen} onOpenChange={setPartialUpdateOpen} onCompleted={load} />
      <HrCreateEmployeeDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </div>
  );
}
