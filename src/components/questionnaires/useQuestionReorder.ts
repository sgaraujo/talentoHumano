import { useState, type Dispatch, type DragEvent, type SetStateAction } from 'react';
import type { Question } from '@/models/types/Questionnaire';

/** Valor centinela para "Sin mapear": Radix Select no admite SelectItem con value="" */
export const UNMAPPED_FIELD = '__none__';

/**
 * Reordenamiento de preguntas: arrastrar desde el asa (drag & drop nativo),
 * subir/bajar con botones y duplicar.
 */
export const useQuestionReorder = (setQuestions: Dispatch<SetStateAction<Question[]>>) => {
  const [handleId, setHandleId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const moveQuestion = (from: number, to: number) => {
    setQuestions(prev => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((q, i) => ({ ...q, order: i }));
    });
  };

  const duplicateQuestion = (index: number) => {
    setQuestions(prev => {
      const source = prev[index];
      if (!source) return prev;
      const stamp = Date.now();
      const copy: Question = {
        ...source,
        id: `q_${stamp}`,
        ...(source.options
          ? { options: source.options.map((opt, i) => ({ ...opt, id: `opt_${stamp}_${i}` })) }
          : {}),
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next.map((q, i) => ({ ...q, order: i }));
    });
  };

  const reset = () => {
    setHandleId(null);
    setDragIndex(null);
    setOverIndex(null);
  };

  /** Props para la tarjeta de la pregunta (solo es arrastrable mientras se sostiene el asa) */
  const getCardProps = (questionId: string, index: number) => ({
    draggable: handleId === questionId,
    onDragStart: (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = 'move';
      setDragIndex(index);
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (dragIndex === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (overIndex !== index) setOverIndex(index);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (dragIndex !== null) moveQuestion(dragIndex, index);
      reset();
    },
    onDragEnd: reset,
  });

  /** Props para el asa (GripVertical) */
  const getHandleProps = (questionId: string) => ({
    onMouseDown: () => setHandleId(questionId),
    onMouseUp: () => setHandleId(null),
    onTouchStart: () => setHandleId(questionId),
  });

  const cardClassName = (index: number) => {
    if (dragIndex === index) return 'opacity-50';
    if (overIndex === index && dragIndex !== null) return 'border-[#008C3C] ring-2 ring-[#008C3C]/30';
    return '';
  };

  return { moveQuestion, duplicateQuestion, getCardProps, getHandleProps, cardClassName };
};
