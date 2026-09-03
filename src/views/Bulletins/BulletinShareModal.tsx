import { useEffect, useMemo, useState } from 'react';
import { Send, Search, Check, User, Building2, X } from 'lucide-react';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { getEmployeeDirectoryUsers } from '@/services/employeeDirectoryService';
import { companyService } from '@/services/companyService';
import type { Bulletin } from '@/models/types/Bulletin';
import type { User as AppUser } from '@/models/types/User';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const sendCommunicationEmail = httpsCallable(functions, 'sendCommunicationEmail');

const ACTIVE_ROLES = new Set(['colaborador']);

type DirectoryUser = AppUser & {
  _assignments?: Array<{ company?: string }>;
};

const companiesOf = (user: DirectoryUser): string[] => {
  const assignments = user._assignments ?? [];
  const names = assignments.map(assignment => assignment.company?.trim()).filter(Boolean) as string[];

  // Compatibilidad con usuarios que todavía lleguen en el formato anterior.
  if (names.length === 0) {
    const company = user.contractInfo?.assignment?.company?.trim();
    if (company) names.push(company);
  }

  return [...new Set(names)];
};

interface Props {
  bulletin: Bulletin;
  open: boolean;
  onClose: () => void;
}

export function BulletinShareModal({ bulletin, open, onClose }: Props) {
  const [users,         setUsers]         = useState<DirectoryUser[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [sending,       setSending]       = useState(false);
  const [companyFilter, setCompanyFilter] = useState<Set<string>>(new Set());
  const [thCompanies,   setThCompanies]   = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch('');
    setSelected(new Set());
    setCompanyFilter(new Set());
    Promise.all([getEmployeeDirectoryUsers(), companyService.getAll()])
      .then(([u, companyCatalog]) => {
        const activeTHNames = new Set(
          companyCatalog.filter(company => company.activeTH).map(company => company.name.trim()),
        );
        setThCompanies(activeTHNames);
        setUsers(u.filter(x =>
          x.email
          && ACTIVE_ROLES.has(x.role)
          && companiesOf(x).some(company => activeTHNames.has(company)),
        ));
      })
      .catch(() => toast.error('Error cargando usuarios'))
      .finally(() => setLoading(false));
  }, [open]);

  const companies = useMemo(() => {
    const set = new Set<string>();
    users.forEach(u => {
      companiesOf(u).forEach(company => {
        if (thCompanies.has(company)) set.add(company);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [users, thCompanies]);

  const toggleCompany = (company: string) =>
    setCompanyFilter(prev => {
      const next = new Set(prev);
      next.has(company) ? next.delete(company) : next.add(company);
      return next;
    });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(u => {
      const matchSearch  = !q || u.fullName?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const userCompanies = companiesOf(u).filter(company => thCompanies.has(company));
      const matchCompany = companyFilter.size === 0 || userCompanies.some(company => companyFilter.has(company));
      return matchSearch && matchCompany;
    });
  }, [users, search, companyFilter, thCompanies]);

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(u => u.id)));
    }
  };

  const encodeEmail = (email: string) =>
    btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const handleSend = async () => {
    if (selected.size === 0) { toast.error('Selecciona al menos un destinatario'); return; }
    setSending(true);
    const bulletinUrl = `${window.location.origin}/boletin/${bulletin.id}`;
    const recipients = users
      .filter(u => selected.has(u.id))
      .map(u => ({
        email: u.email,
        name: u.fullName || u.email.split('@')[0],
        link: `${bulletinUrl}?r=${encodeEmail(u.email)}`,
      }));

    const intro = bulletin.introText
      ? bulletin.introText.slice(0, 200) + (bulletin.introText.length > 200 ? '...' : '')
      : 'Tienes un nuevo boletín disponible.';

    try {
      const result = await sendCommunicationEmail({
        communicationId: `bulletin_${bulletin.id}`,
        title: bulletin.title,
        body: `${bulletin.subtitle ? bulletin.subtitle + '\n\n' : ''}${intro}`,
        recipients,
        senderKey: 'default',
      });
      const data = (result as any)?.data ?? {};
      const sent: number = typeof data.sent === 'number' ? data.sent : recipients.length;
      const errors: Array<{ email: string; error: string }> = data.errors ?? [];

      if (sent === 0 && errors.length > 0) {
        toast.error(`Error al enviar: ${errors[0]?.error?.slice(0, 120) || 'Revisa la configuración de correo'}`);
        console.error('Email errors:', errors);
      } else if (errors.length > 0) {
        toast.success(`Enviado a ${sent} de ${recipients.length}. ${errors.length} fallaron.`);
        console.warn('Partial email errors:', errors);
        onClose();
      } else {
        toast.success(`Boletín enviado a ${sent} destinatario${sent !== 1 ? 's' : ''}`);
        onClose();
      }
    } catch (err: any) {
      const msg = err?.message || err?.details || 'Error desconocido';
      toast.error(`Error al enviar: ${msg}`);
      console.error('sendCommunicationEmail error:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[#008C3C]" />
            Enviar boletín por email
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">"{bulletin.title}"</p>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30"
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Company chips */}
          {companies.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                <Building2 className="w-3 h-3" /> Empresas:
              </span>
              {companies.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCompany(c)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    companyFilter.has(c)
                      ? 'bg-[#008C3C] text-white border-[#008C3C]'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
              {companyFilter.size > 0 && (
                <button
                  type="button"
                  onClick={() => setCompanyFilter(new Set())}
                  className="flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-3 h-3" /> Limpiar
                </button>
              )}
            </div>
          )}

          {/* Select all */}
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <button
              onClick={toggleAll}
              className="flex items-center gap-1 hover:text-[#008C3C] transition-colors font-medium"
            >
              <Check className="w-3.5 h-3.5" />
              {selected.size === filtered.length && filtered.length > 0
                ? 'Deseleccionar todos'
                : `Seleccionar todos (${filtered.length})`}
            </button>
            <span>{selected.size} seleccionado{selected.size !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto border rounded-xl divide-y min-h-0">
          {loading && (
            <div className="p-4 text-center text-sm text-gray-400">Cargando usuarios...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="p-4 text-center text-sm text-gray-400">No se encontraron usuarios</div>
          )}
          {filtered.map(u => {
            const isSelected = selected.has(u.id);
            const userCompanies = companiesOf(u).filter(company => thCompanies.has(company));
            return (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${isSelected ? 'bg-green-50' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-[#008C3C] text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {isSelected ? <Check className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {u.fullName || u.email.split('@')[0]}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  {userCompanies.length > 0 && (
                    <p className="text-[11px] text-gray-400 truncate">
                      {userCompanies.join(' · ')}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={sending || selected.size === 0}
            className="flex items-center gap-2 px-5 py-2 bg-[#008C3C] hover:bg-[#006C2F] text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Enviando...' : `Enviar a ${selected.size || ''} ${selected.size === 1 ? 'persona' : 'personas'}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
