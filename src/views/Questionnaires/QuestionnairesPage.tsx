import { useState, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { assignmentService } from '@/services/assignmentService';
import { useQuestionnaires } from '@/hooks/useQuestionnaires';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Plus,
    Search,
    Loader2,
    FileText,
    CheckCircle,
    XCircle,
    Eye,
    Pencil,
    Trash2,
    ToggleLeft,
    ToggleRight,
    Send,
    Download,
    Bell,
    StopCircle,
    Users,
    Globe,
    Copy,
} from 'lucide-react';
import { CreateQuestionnaireDialog } from '@/components/questionnaires/CreateQuestionnaireDialog';
import { ViewQuestionnaireDialog } from '@/components/questionnaires/ViewQuestionnaireDialog';
import { EditQuestionnaireDialog } from '@/components/questionnaires/EditQuestionnaireDialog';
import { DeleteQuestionnaireDialog } from '@/components/questionnaires/DeleteQuestionnaireDialog';
import { AssignQuestionnaireDialog } from '@/components/questionnaires/AssignQuestionnaireDialog';
import { AssignmentStatusDialog } from '@/components/questionnaires/AssignmentStatusDialog';
import { toast } from 'sonner';
import type { Questionnaire } from '@/models/types/Questionnaire';

export const QuestionnairesPage = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [seedingTemplates, setSeedingTemplates] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<Questionnaire | null>(null);
    const [remindingId, setRemindingId] = useState<string | null>(null);
    const [remindProgress, setRemindProgress] = useState<{ current: number; total: number } | null>(null);
    const abortRef = useRef(false);
    const [statusDialogOpen, setStatusDialogOpen] = useState(false);

    const {
        questionnaires,
        stats,
        loading,
        refreshQuestionnaires,
        toggleActive
    } = useQuestionnaires();

    const handleView = (questionnaire: Questionnaire) => {
        setSelectedQuestionnaire(questionnaire);
        setViewDialogOpen(true);
    };

    const handleEdit = (questionnaire: Questionnaire) => {
        setSelectedQuestionnaire(questionnaire);
        setEditDialogOpen(true);
    };

    const handleDelete = (questionnaire: Questionnaire) => {
        setSelectedQuestionnaire(questionnaire);
        setDeleteDialogOpen(true);
    };

    const handleAssign = (questionnaire: Questionnaire) => {
        if (!questionnaire.active) {
            toast.warning('Cuestionario inactivo', {
                description: 'Activa el cuestionario antes de enviarlo.',
            });
            return;
        }
        setSelectedQuestionnaire(questionnaire);
        setAssignDialogOpen(true);
    };

    const handleRemindPending = async (questionnaire: Questionnaire) => {
        abortRef.current = false;
        setRemindingId(questionnaire.id);
        try {
            const { userService } = await import('@/services/userService');
            const [assignments, allUsers] = await Promise.all([
                assignmentService.getAssignmentsByQuestionnaire(questionnaire.id),
                userService.getAll(),
            ]);
            const activeIds = new Set(
                allUsers
                    .filter(u => u.role === 'colaborador' || u.role === 'lider' || u.role === 'aspirante')
                    .map(u => u.id)
            );
            const pending = assignments.filter(a => a.status === 'pending' && activeIds.has(a.userId));
            if (pending.length === 0) {
                toast.info('No hay pendientes', { description: 'Todos los usuarios activos ya respondieron.' });
                return;
            }
            const base = import.meta.env.VITE_APP_URL ?? window.location.origin;
            const sendFn = httpsCallable(functions, 'sendAssignmentEmail');
            let sent = 0;
            setRemindProgress({ current: 0, total: pending.length });
            for (const a of pending) {
                if (abortRef.current) break;
                await sendFn({
                    to: a.userEmail,
                    userName: a.userName,
                    questionnaires: [{ title: questionnaire.title, link: `${base}/responder/${a.token}` }],
                });
                sent++;
                setRemindProgress({ current: sent, total: pending.length });
            }
            if (abortRef.current && sent < pending.length) {
                toast.warning(`Envío detenido — ${sent} de ${pending.length} recordatorios enviados`);
            } else {
                toast.success(`Recordatorio enviado a ${sent} persona${sent > 1 ? 's' : ''}`);
            }
        } catch (e: any) {
            toast.error('Error al enviar recordatorios', { description: e.message });
        } finally {
            setRemindingId(null);
            setRemindProgress(null);
            abortRef.current = false;
        }
    };

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        try {
            await toggleActive(id, !currentActive);
            toast.success(
                !currentActive ? 'Cuestionario activado' : 'Cuestionario desactivado',
                {
                    description: !currentActive
                        ? 'El cuestionario ahora está disponible para los usuarios.'
                        : 'El cuestionario ya no será visible para los usuarios.',
                }
            );
        } catch (error: any) {
            toast.error('Error al cambiar estado', { description: error.message });
        }
    };

    const handleTogglePublic = async (questionnaire: Questionnaire) => {
        const next = !questionnaire.isPublic;
        try {
            const { questionnaireService } = await import('@/services/questionnaireService');
            await questionnaireService.update(questionnaire.id, { isPublic: next } as any);
            await refreshQuestionnaires();
            if (next) {
                toast.success('Formulario público activado', {
                    description: 'Cualquier persona con el enlace puede responderlo.',
                });
            } else {
                toast.success('Formulario público desactivado');
            }
        } catch (error: any) {
            toast.error('Error al cambiar visibilidad', { description: error.message });
        }
    };

    const handleCopyPublicLink = (questionnaireId: string) => {
        const base = import.meta.env.VITE_APP_URL ?? window.location.origin;
        const url = `${base}/f/${questionnaireId}`;
        navigator.clipboard.writeText(url).then(() => {
            toast.success('Enlace copiado', { description: url });
        });
    };

    const handleSeedTemplates = async () => {
        setSeedingTemplates(true);
        try {
            const { ONBOARDING_TEMPLATES } = await import('@/data/onboardingTemplates');
            const { questionnaireService } = await import('@/services/questionnaireService');
            const { auth } = await import('@/config/firebase');

            const existingTitles = new Set(questionnaires.map((q: any) => q.title));
            const toCreate = ONBOARDING_TEMPLATES.filter(t => !existingTitles.has(t.title));

            if (toCreate.length === 0) {
                toast.info('Las plantillas ya existen', {
                    description: 'Todos los cuestionarios de onboarding ya están creados.',
                });
                return;
            }

            for (const template of toCreate) {
                await questionnaireService.create({
                    ...template,
                    createdBy: auth.currentUser?.uid || '',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }

            toast.success(`${toCreate.length} cuestionarios creados`, {
                description: toCreate.map(t => t.title).join(', '),
            });
            refreshQuestionnaires();
        } catch (error: any) {
            toast.error('Error al cargar plantillas', { description: error.message });
        } finally {
            setSeedingTemplates(false);
        }
    };

    const filteredQuestionnaires = questionnaires.filter((q: any) =>
        q.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Cuestionarios</h1>
                <p className="text-gray-500 mt-1">Gestiona las encuestas y cuestionarios del sistema</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-gray-100 rounded-lg">
                        <FileText className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Total</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-green-100 p-4 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-green-50 rounded-lg">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Activos</p>
                        <p className="text-2xl font-bold text-green-700">{stats.active}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-gray-100 rounded-lg">
                        <XCircle className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Inactivos</p>
                        <p className="text-2xl font-bold text-gray-500">{stats.inactive}</p>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="mb-6 flex gap-3">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder="Buscar cuestionarios..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Button
                    variant="outline"
                    onClick={handleSeedTemplates}
                    disabled={seedingTemplates}
                    title="Carga los cuestionarios de onboarding predeterminados"
                >
                    {seedingTemplates
                        ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        : <Download className="w-4 h-4 mr-2" />
                    }
                    Cargar plantillas
                </Button>
                <Button className="bg-[#008C3C] hover:bg-[#006C2F] text-white" onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Cuestionario
                </Button>
            </div>

            {/* List */}
            <Card>
                <CardHeader>
                    <CardTitle>Lista de Cuestionarios <span className="text-gray-400 font-normal">({filteredQuestionnaires.length})</span></CardTitle>
                    <CardDescription>Visualiza y gestiona todos los cuestionarios</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-16">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-300" />
                            <p className="text-gray-400 mt-3 text-sm">Cargando cuestionarios...</p>
                        </div>
                    ) : filteredQuestionnaires.length === 0 ? (
                        <div className="text-center py-16 text-gray-400">
                            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                            <p className="font-medium">No hay cuestionarios</p>
                            <p className="text-sm mt-1">Crea tu primer cuestionario para comenzar</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredQuestionnaires.map((questionnaire: any) => (
                                <div
                                    key={questionnaire.id}
                                    className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
                                >
                                    {/* Card header */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-gray-900 leading-snug line-clamp-2">
                                                {questionnaire.title}
                                            </h3>
                                            {questionnaire.description && (
                                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                                    {questionnaire.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            {questionnaire.active ? (
                                                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                    <CheckCircle className="w-3 h-3" />
                                                    Activo
                                                </span>
                                            ) : (
                                                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                                    <XCircle className="w-3 h-3" />
                                                    Inactivo
                                                </span>
                                            )}
                                            {questionnaire.isPublic && (
                                                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                                    <Globe className="w-3 h-3" />
                                                    Público
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Meta */}
                                    <div className="flex items-center justify-between text-xs text-gray-400 border-t pt-2">
                                        <span>{questionnaire.questions?.length || 0} preguntas</span>
                                        <span className="capitalize bg-gray-50 border border-gray-100 rounded px-2 py-0.5">
                                            {questionnaire.targetRole === 'all' ? 'Todos' : questionnaire.targetRole}
                                        </span>
                                    </div>

                                    {/* Primary actions */}
                                    <Button
                                        size="sm"
                                        className="w-full bg-[#008C3C] hover:bg-[#006C2F] text-white"
                                        onClick={() => handleAssign(questionnaire)}
                                    >
                                        <Send className="w-3.5 h-3.5 mr-2" />
                                        Enviar a usuarios
                                    </Button>

                                    {remindingId === questionnaire.id ? (
                                        <div className="flex gap-1.5">
                                            <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-md bg-orange-50 border border-orange-200 text-orange-700 text-sm">
                                                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                                <span className="truncate">
                                                    {remindProgress
                                                        ? `Enviando ${remindProgress.current}/${remindProgress.total}...`
                                                        : 'Preparando...'}
                                                </span>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="shrink-0 border-red-200 text-red-600 hover:bg-red-50 px-2"
                                                onClick={() => { abortRef.current = true; }}
                                                title="Detener envío"
                                            >
                                                <StopCircle className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full border-orange-200 text-orange-600 hover:bg-orange-50"
                                            onClick={() => handleRemindPending(questionnaire)}
                                            disabled={!!remindingId}
                                        >
                                            <Bell className="w-3.5 h-3.5 mr-2" />
                                            Recordar a pendientes
                                        </Button>
                                    )}

                                    {/* Public link */}
                                    {questionnaire.isPublic && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full border-blue-200 text-blue-700 hover:bg-blue-50 text-xs"
                                            onClick={() => handleCopyPublicLink(questionnaire.id)}
                                        >
                                            <Copy className="w-3.5 h-3.5 mr-1.5" />
                                            Copiar enlace público
                                        </Button>
                                    )}

                                    {/* Secondary actions — Activar + Hacer público */}
                                    <div className="flex items-center gap-1.5 border-t pt-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 text-xs"
                                            onClick={() => handleToggleActive(questionnaire.id, questionnaire.active)}
                                        >
                                            {questionnaire.active ? (
                                                <><ToggleLeft className="w-3.5 h-3.5 mr-1" />Desactivar</>
                                            ) : (
                                                <><ToggleRight className="w-3.5 h-3.5 mr-1" />Activar</>
                                            )}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={`flex-1 text-xs ${questionnaire.isPublic ? 'border-blue-200 text-blue-700 hover:bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
                                            onClick={() => handleTogglePublic(questionnaire)}
                                        >
                                            <Globe className="w-3.5 h-3.5 mr-1" />
                                            {questionnaire.isPublic ? 'Quitar público' : 'Hacer público'}
                                        </Button>
                                    </div>

                                    {/* Icon actions row */}
                                    <div className="flex items-center justify-end gap-0.5">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => { setSelectedQuestionnaire(questionnaire); setStatusDialogOpen(true); }}
                                            title="Ver quién respondió"
                                            className="px-2"
                                        >
                                            <Users className="w-4 h-4 text-gray-500" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleView(questionnaire)}
                                            title="Ver detalle"
                                            className="px-2"
                                        >
                                            <Eye className="w-4 h-4 text-gray-500" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEdit(questionnaire)}
                                            title="Editar"
                                            className="px-2"
                                        >
                                            <Pencil className="w-4 h-4 text-gray-500" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(questionnaire)}
                                            title="Eliminar"
                                            className="px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <CreateQuestionnaireDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onQuestionnaireCreated={refreshQuestionnaires}
            />

            <ViewQuestionnaireDialog
                open={viewDialogOpen}
                onOpenChange={setViewDialogOpen}
                questionnaire={selectedQuestionnaire}
            />

            <EditQuestionnaireDialog
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                questionnaire={selectedQuestionnaire}
                onQuestionnaireUpdated={refreshQuestionnaires}
            />

            <DeleteQuestionnaireDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                questionnaire={selectedQuestionnaire}
                onQuestionnaireDeleted={refreshQuestionnaires}
            />

            <AssignQuestionnaireDialog
                open={assignDialogOpen}
                onOpenChange={setAssignDialogOpen}
                questionnaire={selectedQuestionnaire}
                onAssigned={refreshQuestionnaires}
            />

            <AssignmentStatusDialog
                open={statusDialogOpen}
                onOpenChange={setStatusDialogOpen}
                questionnaire={selectedQuestionnaire}
            />
        </div>
    );
};
