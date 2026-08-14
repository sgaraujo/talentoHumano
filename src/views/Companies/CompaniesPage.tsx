import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { companyService } from '@/services/companyService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Building2, Plus, Pencil, Search, Loader2,
  Users, Upload, Download, BriefcaseBusiness, UserRoundX, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getCompanyWorkforceOverview, type CompanyWorkforceOverview } from '@/services/companyWorkforceService';

const EMPTY_OVERVIEW: CompanyWorkforceOverview = { activePeople: 0, activeProjects: 0, withoutAccess: 0, incompleteRecords: 0 };

const SEED_COMPANIES = [
  { name: 'NEWSTAR SAS',                                    nit: '901269033-7' },
  { name: 'NEWFORCE SAS',                                   nit: '901311778-4' },
  { name: 'INVERSIONES EON SAS',                            nit: '901271083-1' },
  { name: 'INTEEGRA SAS BIC',                               nit: '900550189-7' },
  { name: 'NETIA SAS',                                      nit: '901259735-6' },
  { name: 'NETCOL INGENIERÍA SAS BIC',                      nit: '901193667-8' },
  { name: 'LETI SAS LOGISTRICA EMPRESARIAL DE TRANSPORTE',  nit: '901264922-7' },
  { name: 'TRIANGULUM BPO SAS',                             nit: '900265286-1' },
  { name: 'ITAC COLOMBIA SAS',                              nit: '901432693-6' },
  { name: 'UNIÓN TEMPORAL ITAC',                            nit: '901351139-9' },
  { name: 'UNIÓN TEMPORAL TECNOLOGÍA EIP',                  nit: '901817890-4' },
  { name: 'UNIÓN TEMPORAL FOMENTO TIC',                     nit: '901834909-7' },
  { name: 'UNIÓN TEMPORAL INTERNUQI',                       nit: '901943575-8' },
  { name: 'CONSORCIO SCIA NETCOL',                          nit: '901419833-7' },
  { name: 'PLEX DE COLOMBIA SAS - EN LIQUIDACIÓN',          nit: '901261185-1' },
  { name: 'RED EMPRESARIAL AMERICANA SAS',                  nit: '900703837-1' },
];
import type { Company } from '@/models/types/Company';

const EMPTY: Omit<Company, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', nit: '', address: '', phone: '', email: '',
  logo: '', regional: '', baseDeOperacion: '', active: true,
  activeTH: false, activeContabilidad: false,
};

export const CompaniesPage = () => {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [overview, setOverview]   = useState<Record<string, CompanyWorkforceOverview>>({});
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [importing, setImporting] = useState(false);

  const [statusFilter, setStatusFilter]       = useState<'all' | 'active' | 'inactive'>('all');
  const [workforceFilter, setWorkforceFilter] = useState<'all' | 'with' | 'without'>('all');
  const [onlyAlerts, setOnlyAlerts]           = useState(false);
  const [regionalFilter, setRegionalFilter]   = useState('all');
  const [baseFilter, setBaseFilter]           = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [data, stats] = await Promise.all([companyService.getAll(), getCompanyWorkforceOverview()]);
      setCompanies(data);
      setOverview(stats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const regionales = useMemo(() => [...new Set(companies.map(c => c.regional).filter(Boolean))].sort() as string[], [companies]);
  const bases       = useMemo(() => [...new Set(companies.map(c => c.baseDeOperacion).filter(Boolean))].sort() as string[], [companies]);

  const filtered = companies.filter(c => {
    const stats = overview[c.id] ?? EMPTY_OVERVIEW;
    const matchesSearch    = c.name.toLowerCase().includes(search.toLowerCase()) || c.nit?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus    = statusFilter === 'all' || (statusFilter === 'active') === c.active;
    const matchesWorkforce = workforceFilter === 'all' || (workforceFilter === 'with' ? stats.activePeople > 0 : stats.activePeople === 0);
    const matchesAlerts    = !onlyAlerts || stats.incompleteRecords > 0;
    const matchesRegional  = regionalFilter === 'all' || c.regional === regionalFilter;
    const matchesBase      = baseFilter === 'all' || c.baseDeOperacion === baseFilter;
    return matchesSearch && matchesStatus && matchesWorkforce && matchesAlerts && matchesRegional && matchesBase;
  });

  const handleImport = async () => {
    setImporting(true);
    try {
      const existing = new Set(companies.map(c => c.nit.trim()));
      const missing = SEED_COMPANIES.filter(s => !existing.has(s.nit));
      if (missing.length === 0) { toast.info('Todas las empresas ya existen'); return; }
      for (const s of missing) {
        await companyService.create({ ...EMPTY, name: s.name, nit: s.nit });
      }
      toast.success(`${missing.length} empresa${missing.length !== 1 ? 's' : ''} creada${missing.length !== 1 ? 's' : ''}`);
      load();
    } catch (e: any) {
      toast.error('Error al importar', { description: e.message });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    const rows = filtered.map(c => ({
      'Nombre':           c.name,
      'NIT':              c.nit,
      'Estado':           c.active ? 'Activa' : 'Inactiva',
      'Talento Humano':   c.activeTH ? 'Sí' : 'No',
      'Contabilidad':     c.activeContabilidad ? 'Sí' : 'No',
      'Regional':         c.regional || '',
      'Base de Operación':c.baseDeOperacion || '',
      'Dirección':        c.address || '',
      'Teléfono':         c.phone || '',
      'Email':            c.email || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Empresas');
    XLSX.writeFile(wb, `empresas_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4A4A4A]">Empresas y dotación</h1>
          <p className="text-[#4A4A4A]/70 mt-1 text-sm">Vista ejecutiva de la estructura laboral por empresa</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            <Download className="w-4 h-4 mr-2" /> Exportar
          </Button>
          <Button onClick={handleImport} disabled={importing} variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50">
            {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Importar lista
          </Button>
          <Button onClick={() => navigate('/configuraciones/empresas')} className="bg-[#008C3C] hover:bg-[#006C2F] text-white">
            <Plus className="w-4 h-4 mr-2" /> Nueva Empresa
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="border-l-4 border-l-[#008C3C]">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-2xl font-bold text-[#008C3C]">{companies.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#1F8FBF]">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Activas</p>
            <p className="text-2xl font-bold text-[#1F8FBF]">{companies.filter(c => c.active).length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Talento Humano</p>
            <p className="text-2xl font-bold text-emerald-600">{companies.filter(c => c.activeTH).length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-gray-500">Contabilidad</p>
            <p className="text-2xl font-bold text-blue-600">{companies.filter(c => c.activeContabilidad).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Buscar por nombre o NIT..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10 border-[#008C3C]/30 focus:ring-[#008C3C]"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <FilterGroup value={statusFilter} onChange={setStatusFilter} options={[['all','Todas'],['active','Activas'],['inactive','Inactivas']]} />
        <FilterGroup value={workforceFilter} onChange={setWorkforceFilter} options={[['all','Con o sin trabajadores'],['with','Con trabajadores'],['without','Sin trabajadores']]} />
        <button
          type="button"
          onClick={() => setOnlyAlerts(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${onlyAlerts ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
        >
          Con inconsistencias
        </button>
        <select value={regionalFilter} onChange={e => setRegionalFilter(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-600">
          <option value="all">Todas las regionales</option>
          {regionales.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={baseFilter} onChange={e => setBaseFilter(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white text-gray-600">
          <option value="all">Todas las bases de operación</option>
          {bases.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#008C3C]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay empresas registradas</p>
          <Button onClick={() => navigate('/configuraciones/empresas')} variant="link" className="text-[#008C3C] mt-2">
            Crear primera empresa
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Card key={c.id} className="hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col overflow-hidden border-gray-200">
              <div className={`h-1.5 ${c.active ? 'bg-[#008C3C]' : 'bg-gray-300'}`} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#008C3C]/10 flex items-center justify-center flex-shrink-0">
                      {c.logo
                        ? <img src={c.logo} alt={c.name} className="w-8 h-8 object-contain rounded" />
                        : <Building2 className="w-5 h-5 text-[#008C3C]" />
                      }
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-[#4A4A4A] leading-tight">
                        {c.name}
                      </CardTitle>
                      <p className="text-xs text-gray-500">NIT: {c.nit}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={c.active ? 'default' : 'secondary'}
                      className={c.active ? 'bg-green-100 text-green-700 text-xs' : 'text-xs'}
                    >
                      {c.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                    {(overview[c.id]?.incompleteRecords ?? 0) > 0 && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] gap-1">
                        <AlertTriangle className="w-3 h-3" /> {overview[c.id]?.incompleteRecords} alerta{overview[c.id]?.incompleteRecords !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col gap-4">
                <p className="text-xs text-gray-400 -mt-2">{c.baseDeOperacion || c.regional || 'Sin ubicación definida'}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-green-50 px-3 py-2.5 flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <div><p className="text-[10px] uppercase tracking-wide text-green-600 font-semibold leading-none">Activos</p><p className="text-lg font-bold text-green-800">{(overview[c.id]?.activePeople ?? 0).toLocaleString('es-CO')}</p></div>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-3 py-2.5 flex items-center gap-2">
                    <BriefcaseBusiness className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <div><p className="text-[10px] uppercase tracking-wide text-blue-600 font-semibold leading-none">Proyectos</p><p className="text-lg font-bold text-blue-800">{(overview[c.id]?.activeProjects ?? 0).toLocaleString('es-CO')}</p></div>
                  </div>
                  <div className="rounded-xl bg-purple-50 px-3 py-2.5 flex items-center gap-2">
                    <UserRoundX className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <div><p className="text-[10px] uppercase tracking-wide text-purple-600 font-semibold leading-none">Sin acceso</p><p className="text-lg font-bold text-purple-800">{(overview[c.id]?.withoutAccess ?? 0).toLocaleString('es-CO')}</p></div>
                  </div>
                  <div className="rounded-xl bg-amber-50 px-3 py-2.5 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div><p className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold leading-none">Alertas</p><p className="text-lg font-bold text-amber-800">{(overview[c.id]?.incompleteRecords ?? 0).toLocaleString('es-CO')}</p></div>
                  </div>
                </div>
                <div className="flex gap-2 mt-auto">
                  <Button
                    size="sm"
                    className="flex-1 text-xs bg-[#008C3C] hover:bg-[#006C2F] text-white"
                    onClick={() => navigate(`/empresas/${c.id}`)}
                  >
                    <Users className="w-3.5 h-3.5 mr-1" /> Abrir empresa
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" title="Configurar empresa" onClick={() => navigate('/configuraciones/empresas')}><Pencil className="w-3.5 h-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

    </div>
  );
};

function FilterGroup<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: Array<[T, string]> }) {
  return (
    <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden">
      {options.map(([optionValue, label], index) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${index > 0 ? 'border-l border-gray-200' : ''} ${value === optionValue ? 'bg-[#008C3C] text-white' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
