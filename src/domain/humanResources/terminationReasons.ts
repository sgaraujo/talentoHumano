/** Lista estándar de motivos de retiro, en el orden en que se muestran en los reportes. */
export const MOTIVOS_RETIRO = [
  'Fallecimiento',
  'Anulado',
  'Renuncia voluntaria',
  'Sustitución patronal',
  'Terminación contrato a término fijo',
  'Terminación contrato con justa causa',
  'Terminación contrato sin justa causa',
  'Terminación contrato de aprendizaje',
  'Terminación de contrato por mutuo acuerdo',
  'Terminación de contrato por obra o labor',
  'Terminación de contrato por periodo de prueba',
  'Terminación de contrato unilateral de aprendizaje',
  'Terminación de contrato por prestación de servicios',
] as const;

/** Normaliza el texto libre de la columna MOTIVO del Excel al motivo estándar más cercano. */
export function normalizeRetiroReason(motivo: string | undefined): { reason: string; notes?: string } {
  if (!motivo) return { reason: 'Renuncia voluntaria' };
  const lower = motivo.toLowerCase().trim();

  if (lower.includes('fallec') || lower.includes('muerte'))           return { reason: 'Fallecimiento' };
  if (lower.includes('anula'))                                         return { reason: 'Anulado' };
  if (lower.includes('renuncia') || lower.includes('voluntar'))       return { reason: 'Renuncia voluntaria' };
  if (lower.includes('sustit') || lower.includes('patronal'))         return { reason: 'Sustitución patronal' };
  if (lower.includes('sin justa') || lower.includes('injusta'))       return { reason: 'Terminación contrato sin justa causa' };
  if (lower.includes('justa causa'))                                   return { reason: 'Terminación contrato con justa causa' };
  if (lower.includes('aprendiz') && lower.includes('unilateral'))     return { reason: 'Terminación de contrato unilateral de aprendizaje' };
  if (lower.includes('aprendiz'))                                      return { reason: 'Terminación contrato de aprendizaje' };
  if (lower.includes('mutuo') || lower.includes('acuerdo'))           return { reason: 'Terminación de contrato por mutuo acuerdo' };
  if (lower.includes('prestaci') && lower.includes('servicio'))       return { reason: 'Terminación de contrato por prestación de servicios' };
  if (lower.includes('obra') || lower.includes('labor'))              return { reason: 'Terminación de contrato por obra o labor' };
  if (lower.includes('prueba') || lower.includes('periodo'))          return { reason: 'Terminación de contrato por periodo de prueba' };
  if (lower.includes('fijo') || lower.includes('término fijo'))       return { reason: 'Terminación contrato a término fijo' };
  if (lower.includes('involuntar') || lower.includes('despid'))       return { reason: 'Terminación contrato sin justa causa' };

  // Si el texto del Excel coincide exactamente con algún motivo estándar
  const exact = MOTIVOS_RETIRO.find(m => m.toLowerCase() === lower);
  if (exact) return { reason: exact };

  return { reason: 'Renuncia voluntaria', notes: motivo };
}

/** Determina si un motivo de retiro (ya normalizado o crudo) corresponde a un retiro voluntario. */
export function esVoluntario(reason?: string): boolean {
  const l = (reason || '').toLowerCase();
  return l.includes('renuncia') || l.includes('mutuo acuerdo') || l === 'voluntario';
}
