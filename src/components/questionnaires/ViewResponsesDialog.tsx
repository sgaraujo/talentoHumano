import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Clock, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { Questionnaire } from '@/models/types/Questionnaire';

interface ViewResponsesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    questionnaire: Questionnaire | null;
}

export const ViewResponsesDialog = ({
    open,
    onOpenChange,
    questionnaire
}: ViewResponsesDialogProps) => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0 });
    const [assignments, setAssignments] = useState<any[]>([]);
    const [responses, setResponses] = useState<any[]>([]);

    useEffect(() => {
        if (open && questionnaire) {
            loadData();
        }
    }, [open, questionnaire]);

    const loadData = async () => {
        if (!questionnaire) return;

        try {
            setLoading(true);
            const { assignmentService } = await import('@/services/assignmentService');
            const { questionnaireService } = await import('@/services/questionnaireService');

            // Cargar asignaciones y estadísticas
            const [assignmentsData, statsData, responsesData] = await Promise.all([
                assignmentService.getAssignmentsByQuestionnaire(questionnaire.id),
                assignmentService.getQuestionnaireStats(questionnaire.id),
                questionnaireService.getResponsesByQuestionnaire(questionnaire.id),
            ]);

            setAssignments(assignmentsData);
            setStats(statsData);
            setResponses(responsesData);
        } catch (error: any) {
            toast.error('Error al cargar respuestas', {
                description: error.message,
            });
        } finally {
            setLoading(false);
        }
    };

    const getAnswerDisplay = (question: any, answer: any) => {
        if (Array.isArray(answer)) {
            return answer.join(', ');
        }
        if (question.type === 'select' || question.type === 'multiple') {
            const option = question.options?.find((opt: any) => opt.value === answer);
            return option?.label || answer;
        }
        return answer?.toString() || 'Sin respuesta';
    };

    const exportToCSV = () => {
        if (!questionnaire || responses.length === 0) return;

        try {
            // Headers
            const headers = [
                'Usuario',
                'Email',
                'Fecha de respuesta',
                ...questionnaire.questions.map(q => q.text),
            ];

            // Rows
            const rows = responses.map(response => {
                const assignment = assignments.find(a => a.responseId === response.id);
                const completedDate = response.completedAt instanceof Date
                    ? response.completedAt
                    : new Date(response.completedAt);

                return [
                    assignment?.userName || 'Desconocido',
                    assignment?.userEmail || '',
                    completedDate.toLocaleString('es-CO'),
                    ...questionnaire.questions.map(q => {
                        const answer = response.answers[q.id];
                        return getAnswerDisplay(q, answer);
                    }),
                ];
            });

            // Convert to CSV
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
            ].join('\n');

            // Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${questionnaire.title}_respuestas.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success('Archivo descargado', {
                description: 'Las respuestas se han exportado exitosamente.',
            });
        } catch (error) {
            toast.error('Error al exportar', {
                description: 'No se pudo generar el archivo CSV.',
            });
        }
    };

    if (!questionnaire) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <div className="flex items-start justify-between">
                        <div>
                            <DialogTitle>Respuestas del Cuestionario</DialogTitle>
                            <DialogDescription className="mt-1">
                                {questionnaire.title}
                            </DialogDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={exportToCSV}
                            disabled={responses.length === 0}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Exportar CSV
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                        </div>
                    ) : (
                        <>
                            {/* Estadísticas */}
                            <div className="grid grid-cols-3 gap-4">
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm font-medium text-gray-600">
                                            Total Enviados
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-3xl font-bold">{stats.total}</p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm font-medium text-gray-600">
                                            Completados
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm font-medium text-gray-600">
                                            Pendientes
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-3xl font-bold text-orange-600">{stats.pending}</p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Lista de usuarios */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Estado de Respuestas</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {assignments.map((assignment) => (
                                            <div
                                                key={assignment.id}
                                                className="flex items-center justify-between p-3 rounded-lg border"
                                            >
                                                <div className="flex-1">
                                                    <p className="font-medium">{assignment.userName}</p>
                                                    <p className="text-sm text-gray-500">{assignment.userEmail}</p>
                                                </div>
                                                {assignment.status === 'completed' ? (
                                                    <Badge className="bg-green-100 text-green-800">
                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                        Completado
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary">
                                                        <Clock className="w-3 h-3 mr-1" />
                                                        Pendiente
                                                    </Badge>
                                                )}
                                            </div>
                                        ))}

                                        {assignments.length === 0 && (
                                            <div className="text-center py-8 text-gray-500">
                                                No se ha enviado este cuestionario a ningún usuario
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Respuestas individuales */}
                            {responses.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Respuestas Detalladas</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-6">
                                            {responses.map((response) => {
                                                const assignment = assignments.find(a => a.responseId === response.id);
                                                return (
                                                    <div key={response.id} className="border-b pb-6 last:border-b-0">
                                                        <div className="mb-4">
                                                            <p className="font-semibold text-lg">{assignment?.userName}</p>
                                                            <p className="text-sm text-gray-500">
                                                                Respondido el {response.completedAt instanceof Date
                                                                    ? response.completedAt.toLocaleString('es-CO', {
                                                                        year: 'numeric',
                                                                        month: 'long',
                                                                        day: 'numeric',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit'
                                                                    })
                                                                    : new Date(response.completedAt).toLocaleString('es-CO', {
                                                                        year: 'numeric',
                                                                        month: 'long',
                                                                        day: 'numeric',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit'
                                                                    })
                                                                }
                                                            </p>
                                                        </div>

                                                        <div className="space-y-4">
                                                            {questionnaire.questions
                                                                .sort((a, b) => a.order - b.order)
                                                                .map((question, index) => (
                                                                    <div key={question.id} className="bg-gray-50 p-4 rounded-lg">
                                                                        <p className="font-medium text-sm mb-2">
                                                                            {index + 1}. {question.text}
                                                                        </p>
                                                                        <p className="text-gray-700">
                                                                            {getAnswerDisplay(question, response.answers[question.id])}
                                                                        </p>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end pt-4 border-t">
                    <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};