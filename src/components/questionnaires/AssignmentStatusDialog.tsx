import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, CheckCircle2, Clock, ExternalLink, Users } from 'lucide-react';
import { assignmentService } from '@/services/assignmentService';
import type { Questionnaire } from '@/models/types/Questionnaire';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionnaire: Questionnaire | null;
}

interface Assignment {
  id: string;
  userName: string;
  userEmail: string;
  status: 'pending' | 'completed';
  assignedAt?: any;
  completedAt?: any;
  responseId?: string;
}

function fmtDate(val: any) {
  if (!val) return '';
  const d = val?.toDate ? val.toDate() : new Date(val);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const AssignmentStatusDialog = ({ open, onOpenChange, questionnaire }: Props) => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  useEffect(() => {
    if (open && questionnaire) {
      setSearch('');
      setFilter('all');
      load(questionnaire.id);
    }
  }, [open, questionnaire]);

  const load = async (id: string) => {
    setLoading(true);
    try {
      const data = await assignmentService.getAssignmentsByQuestionnaire(id);
      setAssignments(data as Assignment[]);
    } finally {
      setLoading(false);
    }
  };

  if (!questionnaire) return null;

  const filtered = assignments.filter(a => {
    const matchSearch =
      a.userName?.toLowerCase().includes(search.toLowerCase()) ||
      a.userEmail?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || a.status === filter;
    return matchSearch && matchFilter;
  });

  const completed = assignments.filter(a => a.status === 'completed' && !!a.responseId).length;
  const pending = assignments.filter(a => a.status === 'pending').length;
  const total = assignments.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            Estado de respuestas
          </DialogTitle>
          <DialogDescription className="line-clamp-1">{questionnaire.title}</DialogDescription>
        </DialogHeader>

        {/* Stats bar */}
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{completed} respondieron</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="flex gap-3 text-sm shrink-0">
            <button
              onClick={() => setFilter('completed')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${filter === 'completed' ? 'bg-green-100 text-green-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {completed} completados
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${filter === 'pending' ? 'bg-orange-100 text-orange-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <Clock className="w-3.5 h-3.5" />
              {pending} pendientes
            </button>
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="text-xs text-gray-400 hover:text-gray-600 px-1"
              >
                Ver todos
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto border rounded-lg divide-y">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-2 text-gray-200" />
              <p className="text-sm">Sin resultados</p>
            </div>
          ) : (
            filtered.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{a.userName}</p>
                  <p className="text-xs text-gray-400 truncate">{a.userEmail}</p>
                </div>
                {a.status === 'completed' ? (
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      <CheckCircle2 className="w-3 h-3" />
                      Respondió
                    </span>
                    {a.completedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(a.completedAt)}</p>
                    )}
                  </div>
                ) : (
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                      <Clock className="w-3 h-3" />
                      Pendiente
                    </span>
                    {a.assignedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">Asignado {fmtDate(a.assignedAt)}</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-400">{total} asignaciones en total</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { onOpenChange(false); navigate('/exportador'); }}
            className="gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ir al Exportador
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
