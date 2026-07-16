import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Loader2, Upload } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { auth, db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS } from '@/config/firestoreCollections';
import { applyHrPartialUpdate, HR_PARTIAL_COLUMNS, type HrPartialRow } from '@/services/hrEmployeeEditService';
import { toast } from 'sonner';

export function HrPartialUpdateDialog({ open, onOpenChange, onCompleted }: {
  open: boolean; onOpenChange: (open: boolean) => void; onCompleted: () => void;
}) {
  const [rows, setRows] = useState<HrPartialRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const readFile = async (file?: File) => {
    if (!file) return;
    setLoading(true); setRows([]); setIssues([]); setProgress(0); setFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const source = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '', raw: false });
      const normalizeHeader = (header: string) => header.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      const normalizedMap = new Map(Object.entries(HR_PARTIAL_COLUMNS).map(([header, field]) => [normalizeHeader(header), field]));
      const headers = Object.keys(source[0] ?? {});
      const documentHeader = headers.find(header => normalizeHeader(header) === 'CEDULA');
      if (!documentHeader) throw new Error('El archivo debe incluir la columna CEDULA.');
      const mapped = headers.flatMap(header => {
        const field = normalizedMap.get(normalizeHeader(header));
        return field ? [{ header, field }] : [];
      });
      if (!mapped.length) throw new Error('No hay columnas actualizables. Incluye al menos un campo además de CEDULA.');
      const existing = new Set((await getDocs(collection(db, FIRESTORE_COLLECTIONS.employees))).docs.map(item => item.id));
      const seen = new Set<string>();
      const nextRows: HrPartialRow[] = [];
      const nextIssues: string[] = [];
      source.forEach((row, index) => {
        const documentNumber = String(row[documentHeader] ?? '').replace(/\D/g, '');
        if (!documentNumber) return nextIssues.push(`Fila ${index + 2}: sin cédula`);
        if (seen.has(documentNumber)) return nextIssues.push(`Fila ${index + 2}: cédula repetida`);
        seen.add(documentNumber);
        if (!existing.has(documentNumber)) return nextIssues.push(`Fila ${index + 2}: expediente no encontrado`);
        const values = Object.fromEntries(mapped.filter(({ header }) => String(row[header] ?? '').trim() !== '').map(({ header, field }) => [field, String(row[header]).trim()]));
        if (Object.keys(values).length) nextRows.push({ row: index + 2, documentNumber, values });
      });
      setColumns(mapped.map(item => item.header)); setRows(nextRows); setIssues(nextIssues);
    } catch (reason: any) { setIssues([reason?.message || 'No fue posible leer el archivo.']); }
    finally { setLoading(false); }
  };

  const apply = async () => {
    if (!rows.length || issues.length) return;
    if (!window.confirm(`Se actualizarán ${rows.length} expedientes. ¿Deseas continuar?`)) return;
    setLoading(true);
    try {
      const updated = await applyHrPartialUpdate(rows, auth.currentUser?.email || 'usuario-desconocido', (done, total) => setProgress(Math.round(done / total * 100)));
      toast.success('Actualización parcial completada', { description: `${updated} expedientes modificados.` });
      onOpenChange(false); onCompleted();
    } catch (reason: any) { toast.error('No se completó la actualización', { description: reason?.message }); }
    finally { setLoading(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-[#008C3C]" />Actualización masiva por cédula</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-100 text-blue-800 font-semibold text-sm">
          <Info className="w-4 h-4" /> ¿Cómo preparar el archivo?
        </div>
        <div className="p-4 space-y-3 text-sm text-gray-700">
          <ol className="space-y-2">
            <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span><span>Crea un Excel nuevo y escribe <b>CEDULA</b> en la primera fila. Esta columna es obligatoria.</span></li>
            <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span><span>Agrega únicamente las columnas que deseas actualizar, usando uno de los nombres admitidos.</span></li>
            <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span><span>Escribe una fila por persona. No repitas una misma cédula dentro del archivo.</span></li>
            <li className="flex gap-2"><span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">4</span><span>Carga el archivo, revisa la validación y pulsa <b>Aplicar cambios</b>.</span></li>
          </ol>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ejemplo</p>
            <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-blue-100/70 text-blue-900"><tr><th className="px-3 py-2 text-left">CEDULA</th><th className="px-3 py-2 text-left">EPS</th><th className="px-3 py-2 text-left">TELEFONO CORPORATIVO</th></tr></thead>
                <tbody><tr className="border-t"><td className="px-3 py-2 font-mono">80024188</td><td className="px-3 py-2">SURA</td><td className="px-3 py-2">3001234567</td></tr></tbody>
              </table>
            </div>
          </div>

          <details className="rounded-lg border border-blue-100 bg-white px-3 py-2">
            <summary className="cursor-pointer font-medium text-blue-700">Ver nombres de columnas admitidos</summary>
            <p className="mt-2 text-xs leading-5 text-gray-500">CORREO CORPORATIVO · CORREO PERSONAL · TELEFONO CORPORATIVO · TELEFONO PERSONAL · EPS · AFP · CCF · CESANTIAS · ENTIDAD BANCARIA · TIPO DE CUENTA · NUMERO DE CUENTA</p>
          </details>

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <b>Importante:</b> las celdas vacías no borran información. Solo se modifican los campos que tengan un valor en el Excel; todo lo demás se conserva.
          </div>
        </div>
      </div>
      <label className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center cursor-pointer hover:bg-gray-50"><Upload className="w-6 h-6 text-[#008C3C] mb-2" /><span className="text-sm font-medium">Seleccionar Excel parcial</span><span className="text-xs text-gray-400 mt-1">.xlsx o .xls</span><input type="file" className="hidden" accept=".xlsx,.xls" onChange={event => { readFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
      {loading && !rows.length && <div className="text-center py-5 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Analizando archivo…</div>}
      {fileName && <div className="border rounded-xl p-4 text-sm"><p className="font-semibold text-gray-700">{fileName}</p><p className="text-gray-500 mt-1">{rows.length} expedientes válidos · Columnas: {columns.join(', ') || '—'}</p></div>}
      {issues.length > 0 && <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 text-sm text-amber-800"><p className="font-semibold flex gap-2"><AlertTriangle className="w-4 h-4" />Corrige el archivo antes de continuar</p><div className="mt-2 max-h-32 overflow-y-auto text-xs space-y-1">{issues.slice(0,100).map((issue,index) => <p key={index}>{issue}</p>)}</div></div>}
      {loading && rows.length > 0 && <div><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#008C3C]" style={{ width: `${progress}%` }} /></div><p className="text-xs text-gray-400 text-right mt-1">{progress}%</p></div>}
      <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>Cancelar</Button><Button className="bg-[#008C3C] hover:bg-[#006C2F]" disabled={loading || !rows.length || issues.length > 0} onClick={apply}>{loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}Aplicar cambios</Button></div>
    </div>
  </DialogContent></Dialog>;
}
