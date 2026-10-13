// Las respuestas de selección se guardan con el `value` de la opción
// (ej. "mejor_oferta_salarial"), no con su etiqueta. Para mostrar y agrupar
// en reportes hay que traducirlas a la etiqueta de la pregunta respondida.

interface AnswerQuestion {
  type: string;
  options?: Array<{ label: string; value: string }>;
}

const isEmpty = (value: unknown) => value === undefined || value === null || value === '';

/** Etiquetas de una respuesta: una por opción elegida (selección múltiple → varias). */
export function answerLabels(question: AnswerQuestion | undefined, value: unknown): string[] {
  if (isEmpty(value)) return [];
  const raw = Array.isArray(value) ? value.filter(item => !isEmpty(item)) : [value];
  const options = question?.options ?? [];
  return raw.map(item => {
    const text = String(item);
    return options.find(option => option.value === text)?.label ?? text;
  });
}

/** Respuesta como texto legible; '—' cuando no hay respuesta. */
export function answerText(question: AnswerQuestion | undefined, value: unknown): string {
  const labels = answerLabels(question, value);
  return labels.length ? labels.join(', ') : '—';
}
