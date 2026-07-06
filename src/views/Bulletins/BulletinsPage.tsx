import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText, Eye, Pencil, Trash2, Globe, Clock, Search, Copy, Tag, BarChart2 } from 'lucide-react';
import { toast } from 'sonner';
import { bulletinService } from '@/services/bulletinService';
import { useAuth } from '@/hooks/useAuth';
import type { Bulletin } from '@/models/types/Bulletin';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const CATEGORIES = ['Bienestar', 'Cultura', 'Noticias', 'Formación', 'Sostenibilidad', 'Otro'];

function fmtDate(d: any) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

const CATEGORY_COLORS: Record<string, string> = {
  'Bienestar':      'bg-emerald-100 text-emerald-700',
  'Cultura':        'bg-purple-100  text-purple-700',
  'Noticias':       'bg-blue-100    text-blue-700',
  'Formación':      'bg-orange-100  text-orange-700',
  'Sostenibilidad': 'bg-teal-100    text-teal-700',
};

export function BulletinsPage() {
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const [bulletins,     setBulletins]     = useState<Bulletin[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [toDelete,      setToDelete]      = useState<Bulletin | null>(null);
  const [cloningId,     setCloningId]     = useState<string | null>(null);
  const [search,        setSearch]        = useState('');
  const [catFilter,     setCatFilter]     = useState('');
  const [tagFilter,     setTagFilter]     = useState('');
  const [statusFilter,  setStatusFilter]  = useState<'all' | 'published' | 'draft'>('all');

  const allTags = useMemo(() => {
    const set = new Set<string>();
    bulletins.forEach(b => b.tags?.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [bulletins]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bulletins.filter(b => {
      const matchSearch = !q || b.title.toLowerCase().includes(q) || b.subtitle?.toLowerCase().includes(q);
      const matchCat    = !catFilter || b.category === catFilter;
      const matchTag    = !tagFilter || b.tags?.includes(tagFilter);
      const matchStatus = statusFilter === 'all' || b.status === statusFilter;
      return matchSearch && matchCat && matchTag && matchStatus;
    });
  }, [bulletins, search, catFilter, tagFilter, statusFilter]);

  useEffect(() => {
    bulletinService.getAll()
      .then(setBulletins)
      .catch(() => toast.error('Error cargando boletines'))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await bulletinService.delete(toDelete.id);
      setBulletins(prev => prev.filter(b => b.id !== toDelete.id));
      toast.success('Boletín eliminado');
    } catch {
      toast.error('Error al eliminar');
    } finally {
      setToDelete(null);
    }
  };

  const handleClone = async (b: Bulletin) => {
    setCloningId(b.id);
    try {
      const newId = await bulletinService.clone(b.id, user?.email || '', user?.email?.split('@')[0]);
      toast.success('Boletín duplicado');
      navigate(`/boletines/${newId}/editar`);
    } catch {
      toast.error('Error al duplicar');
    } finally {
      setCloningId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Boletines</h1>
          <p className="text-sm text-gray-500 mt-1">Crea y publica boletines internos para tus equipos</p>
        </div>
        <button
          onClick={() => navigate('/boletines/nuevo')}
          className="flex items-center gap-2 bg-[#008C3C] hover:bg-[#006C2F] text-white px-4 py-2 rounded-xl font-medium text-sm transition-colors shadow-sm"
        >
          <PlusCircle className="w-4 h-4" />
          Nuevo boletín
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30 bg-white"
            placeholder="Buscar boletín..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30"
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {allTags.length > 0 && (
          <select
            className="border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30"
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
          >
            <option value="">Todas las etiquetas</option>
            {allTags.map(t => <option key={t} value={t}>#{t}</option>)}
          </select>
        )}
        <select
          className="border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
        >
          <option value="all">Todos los estados</option>
          <option value="published">Publicados</option>
          <option value="draft">Borradores</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => <div key={i} className="h-56 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FileText className="w-12 h-12 text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">
            {bulletins.length === 0 ? 'No hay boletines aún' : 'No hay resultados para esta búsqueda'}
          </p>
          {bulletins.length === 0 && (
            <button onClick={() => navigate('/boletines/nuevo')} className="mt-4 text-sm text-[#008C3C] hover:underline font-medium">
              Crear boletín
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(b => (
            <div key={b.id} className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
              {/* Hero thumbnail */}
              <div
                className="h-36 w-full relative overflow-hidden cursor-pointer"
                onClick={() => navigate(`/boletin/${b.id}`)}
                style={{
                  background: b.heroImageUrl ? undefined : (b.heroColor || 'linear-gradient(135deg, #006330, #7BCB6A)'),
                  backgroundImage: b.heroImageUrl ? `url(${b.heroImageUrl})` : undefined,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                }}
              >
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute top-3 left-3">
                  {b.status === 'published'
                    ? <span className="flex items-center gap-1 bg-white/90 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full"><Globe className="w-3 h-3" /> Publicado</span>
                    : <span className="flex items-center gap-1 bg-white/90 text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> Borrador</span>}
                </div>
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  {b.views != null && b.views > 0 && (
                    <span className="flex items-center gap-1 bg-black/40 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm">
                      <Eye className="w-3 h-3" /> {b.views}
                    </span>
                  )}
                </div>
                {b.category && (
                  <div className="absolute bottom-3 left-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[b.category] || 'bg-gray-100 text-gray-700'}`}>
                      {b.category}
                    </span>
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 leading-snug">{b.title}</h3>
                {b.subtitle && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{b.subtitle}</p>}

                {/* Tags */}
                {b.tags && b.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {b.tags.slice(0, 3).map(tag => (
                      <button
                        key={tag}
                        onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                        className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${tagFilter === tag ? 'bg-[#008C3C] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                      >
                        <Tag className="w-2.5 h-2.5" />{tag}
                      </button>
                    ))}
                    {b.tags.length > 3 && <span className="text-[10px] text-gray-400">+{b.tags.length - 3}</span>}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3">
                  <span className="text-[11px] text-gray-400">
                    {b.status === 'published' && b.publishedAt ? fmtDate(b.publishedAt) : `Editado ${fmtDate(b.updatedAt)}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => navigate(`/boletin/${b.id}`)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ver">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => navigate(`/boletines/${b.id}/editar`)}
                      className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleClone(b)} disabled={cloningId === b.id}
                      className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors disabled:opacity-40" title="Duplicar">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => navigate(`/boletines/${b.id}/estadisticas`)}
                      className="p-1.5 text-gray-400 hover:text-[#008C3C] hover:bg-green-50 rounded-lg transition-colors" title="Estadísticas">
                      <BarChart2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setToDelete(b)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={open => { if (!open) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar boletín?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>"{toDelete?.title}"</strong> permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
