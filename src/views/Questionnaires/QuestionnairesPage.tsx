import { useState } from 'react';
import { useQuestionnaires } from '@/hooks/useQuestionnaires';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ViewResponsesDialog } from '@/components/questionnaires/ViewResponsesDialog';
import {
    Plus,
    Search,
    Loader2,
    FileText,
    CheckCircle,
    XCircle,
    BarChart3,
    Eye,
    Pencil,
    Trash2,
    ToggleLeft,
    ToggleRight,
    Send
} from 'lucide-react';
import { CreateQuestionnaireDialog } from '@/components/questionnaires/CreateQuestionnaireDialog';
import { ViewQuestionnaireDialog } from '@/components/questionnaires/ViewQuestionnaireDialog';
import { EditQuestionnaireDialog } from '@/components/questionnaires/EditQuestionnaireDialog';
import { DeleteQuestionnaireDialog } from '@/components/questionnaires/DeleteQuestionnaireDialog';
import { AssignQuestionnaireDialog } from '@/components/questionnaires/AssignQuestionnaireDialog';
import { toast } from 'sonner';
import type { Questionnaire } from '@/models/types/Questionnaire';

export const QuestionnairesPage = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<Questionnaire | null>(null);
    const [responsesDialogOpen, setResponsesDialogOpen] = useState(false);

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
    const handleViewResponses = (questionnaire: Questionnaire) => {
        setSelectedQuestionnaire(questionnaire);
        setResponsesDialogOpen(true);
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
            toast.error('Error al cambiar estado', {
                description: error.message
            });
        }
    };

    const filteredQuestionnaires = questionnaires.filter((q: any) =>
        q.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Cuestionarios</h1>
                <p className="text-gray-600 mt-1">Gestiona las encuestas y cuestionarios del sistema</p>
            </div>

            <div className="mb-6 flex gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder="Buscar cuestionarios..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>

                <Button className='bg-[#008C3C] hover:bg-[#006C2F] text-white' variant="default" onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Cuestionario
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Total</CardDescription>
                        <FileText className="w-4 h-4 text-gray-500" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold">{stats.total}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Activos</CardDescription>
                        <CheckCircle className="w-4 h-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-green-600">{stats.active}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardDescription>Inactivos</CardDescription>
                        <XCircle className="w-4 h-4 text-gray-500" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-bold text-gray-600">{stats.inactive}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Lista de Cuestionarios ({filteredQuestionnaires.length})</CardTitle>
                    <CardDescription>
                        Visualiza y gestiona todos los cuestionarios
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
                            <p className="text-gray-500 mt-2">Cargando...</p>
                        </div>
                    ) : filteredQuestionnaires.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No hay cuestionarios creados</p>
                            <p className="text-sm mt-2">Crea tu primer cuestionario para comenzar</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredQuestionnaires.map((questionnaire: any) => (
                                <Card key={questionnaire.id} className="hover:shadow-lg transition-shadow">
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <CardTitle className="text-lg">{questionnaire.title}</CardTitle>
                                                <CardDescription className="mt-1 line-clamp-2">
                                                    {questionnaire.description}
                                                </CardDescription>
                                            </div>
                                            {questionnaire.active ? (
                                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3" />
                                                    Activo
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs flex items-center gap-1">
                                                    <XCircle className="w-3 h-3" />
                                                    Inactivo
                                                </span>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between text-sm text-gray-500">
                                                <span>{questionnaire.questions?.length || 0} preguntas</span>
                                                <span className="capitalize">
                                                    {questionnaire.targetRole === 'all' ? 'Todos' : questionnaire.targetRole}
                                                </span>
                                            </div>

                                            <div className="space-y-2">
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="w-full"
                                                    onClick={() => handleAssign(questionnaire)}
                                                >
                                                    <Send className="w-4 h-4 mr-2" />
                                                    Enviar a usuarios
                                                </Button>

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full"
                                                    onClick={() => handleViewResponses(questionnaire)}
                                                >
                                                    <BarChart3 className="w-4 h-4 mr-2" />
                                                    Ver Respuestas
                                                </Button>

                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="flex-1"
                                                        onClick={() => handleToggleActive(questionnaire.id, questionnaire.active)}
                                                    >
                                                        {questionnaire.active ? (
                                                            <>
                                                                <ToggleLeft className="w-4 h-4 mr-1" />
                                                                Desactivar
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ToggleRight className="w-4 h-4 mr-1" />
                                                                Activar
                                                            </>
                                                        )}
                                                    </Button>

                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleView(questionnaire)}
                                                        title="Ver"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>

                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleEdit(questionnaire)}
                                                        title="Editar"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>

                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(questionnaire)}
                                                        className="text-red-600 hover:text-red-700"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
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

            <ViewResponsesDialog
                open={responsesDialogOpen}
                onOpenChange={setResponsesDialogOpen}
                questionnaire={selectedQuestionnaire}
            />
        </div>
    );
};