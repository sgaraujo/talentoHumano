import type { Questionnaire } from '@/models/types/Questionnaire';

type Template = Omit<Questionnaire, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>;

// Helper to build question IDs scoped per template
const q = (prefix: string, i: number) => `${prefix}_q${i}`;

// ─────────────────────────────────────────────
// 1. DATOS PERSONALES
// ─────────────────────────────────────────────
const P = 'dp';
const datosPersonales: Template = {
  title: 'Datos Personales',
  description: 'Información básica de identificación del colaborador.',
  targetRole: 'all',
  active: true,
  isOnboarding: true,
  isRequired: false,
  allowMultipleCompletions: false,
  questions: [
    {
      id: q(P, 0), order: 0, text: '¿Cuál es tu tipo de documento?', type: 'select', required: true,
      options: [
        { id: 'cc',  label: 'Cédula de Ciudadanía (CC)',  value: 'CC' },
        { id: 'ce',  label: 'Cédula de Extranjería (CE)', value: 'CE' },
        { id: 'pas', label: 'Pasaporte',                  value: 'Pasaporte' },
        { id: 'ti',  label: 'Tarjeta de Identidad (TI)',  value: 'TI' },
        { id: 'nit', label: 'NIT',                        value: 'NIT' },
      ],
    },
    { id: q(P, 1), order: 1, text: '¿Cuál es tu número de documento?',    type: 'text',   required: true },
    {
      id: q(P, 2), order: 2, text: '¿Cuál es tu género?', type: 'select', required: true,
      options: [
        { id: 'm',  label: 'Masculino',        value: 'Masculino' },
        { id: 'f',  label: 'Femenino',         value: 'Femenino' },
        { id: 'nb', label: 'No binario',       value: 'No binario' },
        { id: 'nd', label: 'Prefiero no decir', value: 'Prefiero no decir' },
      ],
    },
    { id: q(P, 3), order: 3, text: '¿Cuál es tu fecha de nacimiento?',    type: 'date',   required: true },
    {
      id: q(P, 4), order: 4, text: '¿Cuál es tu grupo sanguíneo?', type: 'select', required: false,
      options: [
        { id: 'ap', label: 'A+', value: 'A+' }, { id: 'am', label: 'A-', value: 'A-' },
        { id: 'bp', label: 'B+', value: 'B+' }, { id: 'bm', label: 'B-', value: 'B-' },
        { id: 'abp', label: 'AB+', value: 'AB+' }, { id: 'abm', label: 'AB-', value: 'AB-' },
        { id: 'op', label: 'O+', value: 'O+' }, { id: 'om', label: 'O-', value: 'O-' },
      ],
    },
    {
      id: q(P, 5), order: 5, text: '¿Cuál es tu estado civil?', type: 'select', required: true,
      options: [
        { id: 'sol', label: 'Soltero/a',      value: 'Soltero/a' },
        { id: 'cas', label: 'Casado/a',       value: 'Casado/a' },
        { id: 'ul',  label: 'Unión libre',    value: 'Unión libre' },
        { id: 'div', label: 'Divorciado/a',   value: 'Divorciado/a' },
        { id: 'viu', label: 'Viudo/a',        value: 'Viudo/a' },
      ],
    },
    { id: q(P, 6), order: 6, text: '¿Cuál es tu nacionalidad?',           type: 'text',   required: false },
    { id: q(P, 7), order: 7, text: '¿Cuál es tu número de teléfono personal?', type: 'text', required: true },
  ],
  fieldMappings: [
    { questionId: q(P, 0), fieldPath: 'personalData.documentType',   overwrite: true },
    { questionId: q(P, 1), fieldPath: 'personalData.documentNumber', overwrite: true },
    { questionId: q(P, 2), fieldPath: 'personalData.gender',         overwrite: true },
    { questionId: q(P, 3), fieldPath: 'personalData.birthDate',      overwrite: true },
    { questionId: q(P, 4), fieldPath: 'personalData.bloodType',      overwrite: false },
    { questionId: q(P, 5), fieldPath: 'personalData.maritalStatus',  overwrite: true },
    { questionId: q(P, 6), fieldPath: 'personalData.nationality',    overwrite: false },
    { questionId: q(P, 7), fieldPath: 'personalData.phone',          overwrite: true },
  ],
};

// ─────────────────────────────────────────────
// 2. UBICACIÓN Y CONTACTO
// ─────────────────────────────────────────────
const U = 'uc';
const ubicacionContacto: Template = {
  title: 'Ubicación y Contacto',
  description: 'Datos de residencia y contacto de emergencia del colaborador.',
  targetRole: 'all',
  active: true,
  isOnboarding: true,
  isRequired: false,
  allowMultipleCompletions: false,
  questions: [
    { id: q(U, 0), order: 0, text: '¿En qué país resides?',                           type: 'text', required: true },
    { id: q(U, 1), order: 1, text: '¿En qué departamento o estado resides?',          type: 'text', required: true },
    { id: q(U, 2), order: 2, text: '¿En qué ciudad resides?',                         type: 'text', required: true },
    { id: q(U, 3), order: 3, text: '¿En qué barrio o localidad vives?',               type: 'text', required: false },
    { id: q(U, 4), order: 4, text: '¿Cuál es tu dirección de residencia?',            type: 'text', required: true },
    { id: q(U, 5), order: 5, text: '¿Cuál es tu correo electrónico personal?',        type: 'text', required: false },
    { id: q(U, 6), order: 6, text: '¿Cuál es el nombre de tu contacto de emergencia?',      type: 'text', required: true },
    { id: q(U, 7), order: 7, text: '¿Qué parentesco tiene contigo ese contacto?',           type: 'text', required: true },
    { id: q(U, 8), order: 8, text: '¿Cuál es el teléfono de tu contacto de emergencia?',    type: 'text', required: true },
  ],
  fieldMappings: [
    { questionId: q(U, 0), fieldPath: 'location.country',                         overwrite: true },
    { questionId: q(U, 1), fieldPath: 'location.state',                           overwrite: true },
    { questionId: q(U, 2), fieldPath: 'location.city',                            overwrite: true },
    { questionId: q(U, 3), fieldPath: 'location.neighborhood',                    overwrite: true },
    { questionId: q(U, 4), fieldPath: 'location.address',                         overwrite: true },
    { questionId: q(U, 5), fieldPath: 'location.personalEmail',                   overwrite: true },
    { questionId: q(U, 6), fieldPath: 'location.emergencyContact.fullName',       overwrite: true },
    { questionId: q(U, 7), fieldPath: 'location.emergencyContact.relationship',   overwrite: true },
    { questionId: q(U, 8), fieldPath: 'location.emergencyContact.phone',          overwrite: true },
  ],
};

// ─────────────────────────────────────────────
// 3. PERFIL PROFESIONAL
// ─────────────────────────────────────────────
const PR = 'pp';
const perfilProfesional: Template = {
  title: 'Perfil Profesional',
  description: 'Formación académica y área de conocimiento del colaborador.',
  targetRole: 'all',
  active: true,
  isOnboarding: true,
  isRequired: false,
  allowMultipleCompletions: false,
  questions: [
    {
      id: q(PR, 0), order: 0, text: '¿Cuál es tu nivel académico más alto alcanzado?', type: 'select', required: true,
      options: [
        { id: 'pri', label: 'Primaria',        value: 'Primaria' },
        { id: 'sec', label: 'Secundaria',      value: 'Secundaria' },
        { id: 'tec', label: 'Técnico',         value: 'Técnico' },
        { id: 'tno', label: 'Tecnólogo',       value: 'Tecnólogo' },
        { id: 'uni', label: 'Universitario',   value: 'Universitario' },
        { id: 'esp', label: 'Especialización', value: 'Especialización' },
        { id: 'mae', label: 'Maestría',        value: 'Maestría' },
        { id: 'doc', label: 'Doctorado',       value: 'Doctorado' },
      ],
    },
    { id: q(PR, 1), order: 1, text: '¿Cuál es tu título o carrera principal?',          type: 'text', required: false },
    { id: q(PR, 2), order: 2, text: '¿En qué institución educativa te formaste?',       type: 'text', required: false },
    { id: q(PR, 3), order: 3, text: '¿Cuál es tu área de conocimiento o especialidad?', type: 'text', required: false },
    {
      id: q(PR, 4), order: 4, text: '¿Cuál es tu estado actual de estudios?', type: 'select', required: false,
      options: [
        { id: 'gra', label: 'Graduado/a',            value: 'Graduado/a' },
        { id: 'enc', label: 'En curso',               value: 'En curso' },
        { id: 'est', label: 'Egresado sin título',    value: 'Egresado sin título' },
        { id: 'na',  label: 'No aplica',              value: 'No aplica' },
      ],
    },
  ],
  fieldMappings: [
    { questionId: q(PR, 0), fieldPath: 'professionalProfile.academicLevel',          overwrite: true },
    { questionId: q(PR, 1), fieldPath: 'professionalProfile.degree',                 overwrite: true },
    { questionId: q(PR, 2), fieldPath: 'professionalProfile.educationalInstitution', overwrite: true },
    { questionId: q(PR, 3), fieldPath: 'professionalProfile.knowledgeArea',          overwrite: true },
    { questionId: q(PR, 4), fieldPath: 'professionalProfile.educationStatus',        overwrite: true },
  ],
};

// ─────────────────────────────────────────────
// 4. DATOS SOCIOECONÓMICOS
// ─────────────────────────────────────────────
const SE = 'se';
const datosSocioeconomicos: Template = {
  title: 'Datos Sociodemográficos',
  description: 'Estrato, tiempo de desplazamiento y características sociodemográficas.',
  targetRole: 'all',
  active: true,
  isOnboarding: true,
  isRequired: false,
  allowMultipleCompletions: false,
  questions: [
    {
      id: q(SE, 0), order: 0, text: '¿En qué estrato socioeconómico vives?', type: 'select', required: false,
      options: [
        { id: 's1', label: 'Estrato 1', value: '1' },
        { id: 's2', label: 'Estrato 2', value: '2' },
        { id: 's3', label: 'Estrato 3', value: '3' },
        { id: 's4', label: 'Estrato 4', value: '4' },
        { id: 's5', label: 'Estrato 5', value: '5' },
        { id: 's6', label: 'Estrato 6', value: '6' },
      ],
    },
    {
      id: q(SE, 1), order: 1, text: '¿Cuánto tiempo tardas en llegar al trabajo?', type: 'select', required: false,
      options: [
        { id: 't1', label: 'Menos de 30 minutos',  value: 'Menos de 30 minutos' },
        { id: 't2', label: 'Entre 30 min y 1 hora', value: 'Entre 30 min y 1 hora' },
        { id: 't3', label: 'Entre 1 y 2 horas',    value: 'Entre 1 y 2 horas' },
        { id: 't4', label: 'Más de 2 horas',        value: 'Más de 2 horas' },
      ],
    },
    {
      id: q(SE, 2), order: 2, text: '¿Te identificas con alguna comunidad o grupo étnico?', type: 'select', required: false,
      options: [
        { id: 'ni',  label: 'Ninguno',            value: 'Ninguno' },
        { id: 'af',  label: 'Afrocolombiano/a',   value: 'Afrocolombiano/a' },
        { id: 'in',  label: 'Indígena',           value: 'Indígena' },
        { id: 'ra',  label: 'Raizal',             value: 'Raizal' },
        { id: 'ro',  label: 'ROM / Gitano',       value: 'ROM / Gitano' },
        { id: 'ot',  label: 'Otro',               value: 'Otro' },
        { id: 'nd',  label: 'Prefiero no decir',  value: 'Prefiero no decir' },
      ],
    },
    {
      id: q(SE, 3), order: 3, text: '¿Tienes algún tipo de discapacidad?', type: 'select', required: false,
      options: [
        { id: 'nin', label: 'Ninguna',             value: 'Ninguna' },
        { id: 'vis', label: 'Visual',              value: 'Visual' },
        { id: 'aud', label: 'Auditiva',            value: 'Auditiva' },
        { id: 'mot', label: 'Motriz',              value: 'Motriz' },
        { id: 'cog', label: 'Cognitiva',           value: 'Cognitiva' },
        { id: 'mul', label: 'Múltiple',            value: 'Múltiple' },
        { id: 'pnd', label: 'Prefiero no decir',   value: 'Prefiero no decir' },
      ],
    },
  ],
  fieldMappings: [
    { questionId: q(SE, 0), fieldPath: 'demographicData.socioeconomicLevel', overwrite: true },
    { questionId: q(SE, 1), fieldPath: 'demographicData.commuteTime',        overwrite: true },
    { questionId: q(SE, 2), fieldPath: 'demographicData.ethnicity',          overwrite: true },
    { questionId: q(SE, 3), fieldPath: 'demographicData.disability',         overwrite: true },
  ],
};

// ─────────────────────────────────────────────
// 5. FAMILIA
// ─────────────────────────────────────────────
const F = 'fam';
const familia: Template = {
  title: 'Familia y Hogar',
  description: 'Composición del núcleo familiar y responsabilidades de cuidado.',
  targetRole: 'all',
  active: true,
  isOnboarding: true,
  isRequired: false,
  allowMultipleCompletions: false,
  questions: [
    {
      id: q(F, 0), order: 0, text: '¿Cómo describes tu tipo de familia?', type: 'select', required: false,
      options: [
        { id: 'nuc', label: 'Nuclear (pareja e hijos)',      value: 'Nuclear' },
        { id: 'mon', label: 'Monoparental (un solo padre)',  value: 'Monoparental' },
        { id: 'ext', label: 'Extendida (con otros familiares)', value: 'Extendida' },
        { id: 'rec', label: 'Recompuesta (hijos de uniones previas)', value: 'Recompuesta' },
        { id: 'shi', label: 'Sin hijos',                    value: 'Sin hijos' },
        { id: 'sol', label: 'Vivo solo/a',                  value: 'Vivo solo/a' },
      ],
    },
    { id: q(F, 1), order: 1, text: '¿Cuántos hijos tienes?',                              type: 'number', required: false },
    { id: q(F, 2), order: 2, text: '¿Cuántas personas viven contigo (incluyéndote)?',     type: 'number', required: false },
    {
      id: q(F, 3), order: 3, text: '¿Tienes responsabilidades de cuidado de personas dependientes?', type: 'select', required: false,
      options: [
        { id: 'no',  label: 'No',                                 value: 'No' },
        { id: 'ch',  label: 'Sí – Hijos menores de edad',         value: 'Sí – Hijos menores de edad' },
        { id: 'am',  label: 'Sí – Adultos mayores',               value: 'Sí – Adultos mayores' },
        { id: 'pd',  label: 'Sí – Personas con discapacidad',     value: 'Sí – Personas con discapacidad' },
        { id: 'va',  label: 'Sí – Varios de los anteriores',      value: 'Sí – Varios' },
      ],
    },
  ],
  fieldMappings: [
    { questionId: q(F, 0), fieldPath: 'family.familyType',                overwrite: true },
    { questionId: q(F, 1), fieldPath: 'family.numberOfChildren',          overwrite: true },
    { questionId: q(F, 2), fieldPath: 'family.numberOfCohabitants',       overwrite: true },
    { questionId: q(F, 3), fieldPath: 'family.caregiverResponsibilities', overwrite: true },
  ],
};

// ─────────────────────────────────────────────
// 6. SEGURIDAD SOCIAL
// ─────────────────────────────────────────────
const SS = 'ss';
const seguridadSocial: Template = {
  title: 'Seguridad Social',
  description: 'Afiliaciones a EPS, AFP, CCF y nivel de riesgo ARL.',
  targetRole: 'all',
  active: true,
  isOnboarding: true,
  isRequired: false,
  allowMultipleCompletions: false,
  questions: [
    { id: q(SS, 0), order: 0, text: '¿A qué EPS estás afiliado/a?',                  type: 'text', required: true },
    { id: q(SS, 1), order: 1, text: '¿A qué fondo de pensiones (AFP) estás afiliado/a?', type: 'text', required: true },
    { id: q(SS, 2), order: 2, text: '¿A qué caja de compensación (CCF) estás afiliado/a?', type: 'text', required: false },
    {
      id: q(SS, 3), order: 3, text: '¿Cuál es tu nivel de riesgo ARL?', type: 'select', required: false,
      options: [
        { id: 'r1', label: 'Nivel I   – Riesgo mínimo',  value: 'I' },
        { id: 'r2', label: 'Nivel II  – Riesgo bajo',    value: 'II' },
        { id: 'r3', label: 'Nivel III – Riesgo medio',   value: 'III' },
        { id: 'r4', label: 'Nivel IV  – Riesgo alto',    value: 'IV' },
        { id: 'r5', label: 'Nivel V   – Riesgo máximo',  value: 'V' },
      ],
    },
  ],
  fieldMappings: [
    { questionId: q(SS, 0), fieldPath: 'socialSecurity.eps',          overwrite: true },
    { questionId: q(SS, 1), fieldPath: 'socialSecurity.afp',          overwrite: true },
    { questionId: q(SS, 2), fieldPath: 'socialSecurity.ccf',          overwrite: true },
    { questionId: q(SS, 3), fieldPath: 'socialSecurity.arlRiskLevel', overwrite: true },
  ],
};

// ─────────────────────────────────────────────
// 7. INFORMACIÓN BANCARIA
// ─────────────────────────────────────────────
const B = 'ban';
const informacionBancaria: Template = {
  title: 'Información Bancaria',
  description: 'Datos de cuenta bancaria para el pago de nómina.',
  targetRole: 'all',
  active: true,
  isOnboarding: true,
  isRequired: false,
  allowMultipleCompletions: false,
  questions: [
    {
      id: q(B, 0), order: 0, text: '¿En qué banco tienes tu cuenta de nómina?', type: 'select', required: true,
      options: [
        { id: 'bcol', label: 'Bancolombia',         value: 'Bancolombia' },
        { id: 'davi', label: 'Davivienda',           value: 'Davivienda' },
        { id: 'bbva', label: 'BBVA',                 value: 'BBVA' },
        { id: 'bog',  label: 'Banco de Bogotá',      value: 'Banco de Bogotá' },
        { id: 'pop',  label: 'Banco Popular',        value: 'Banco Popular' },
        { id: 'occ',  label: 'Banco de Occidente',   value: 'Banco de Occidente' },
        { id: 'av',   label: 'AV Villas',            value: 'AV Villas' },
        { id: 'neq',  label: 'Nequi',               value: 'Nequi' },
        { id: 'dpl',  label: 'Daviplata',            value: 'Daviplata' },
        { id: 'otro', label: 'Otro',                 value: 'Otro' },
      ],
    },
    {
      id: q(B, 1), order: 1, text: '¿Qué tipo de cuenta tienes?', type: 'select', required: true,
      options: [
        { id: 'aho', label: 'Cuenta de ahorros',  value: 'Cuenta de ahorros' },
        { id: 'cor', label: 'Cuenta corriente',   value: 'Cuenta corriente' },
      ],
    },
    { id: q(B, 2), order: 2, text: '¿Cuál es tu número de cuenta?', type: 'text', required: true },
  ],
  fieldMappings: [
    { questionId: q(B, 0), fieldPath: 'bankingInfo.bankName',      overwrite: true },
    { questionId: q(B, 1), fieldPath: 'bankingInfo.accountType',   overwrite: true },
    { questionId: q(B, 2), fieldPath: 'bankingInfo.accountNumber', overwrite: true },
  ],
};

// ─────────────────────────────────────────────
// 8. CONTRATO Y ASIGNACIÓN
// ─────────────────────────────────────────────
const C = 'con';
const contratoAsignacion: Template = {
  title: 'Contrato y Asignación',
  description: 'Empresa, área, cargo y condiciones de vinculación laboral.',
  targetRole: 'colaborador',
  active: true,
  isOnboarding: true,
  isRequired: false,
  allowMultipleCompletions: false,
  questions: [
    { id: q(C, 0), order: 0, text: '¿A qué empresa estás vinculado/a?',         type: 'text', required: true },
    { id: q(C, 1), order: 1, text: '¿En qué área o departamento trabajas?',      type: 'text', required: true },
    { id: q(C, 2), order: 2, text: '¿Cuál es tu cargo o posición?',              type: 'text', required: true },
    { id: q(C, 3), order: 3, text: '¿A qué proyecto estás asignado/a actualmente?', type: 'text', required: false },
    { id: q(C, 4), order: 4, text: '¿Cuál es tu sede de trabajo?',               type: 'text', required: false },
    {
      id: q(C, 5), order: 5, text: '¿Qué tipo de contrato tienes?', type: 'select', required: true,
      options: [
        { id: 'fij', label: 'Término fijo',              value: 'Término fijo' },
        { id: 'ind', label: 'Término indefinido',        value: 'Término indefinido' },
        { id: 'ps',  label: 'Prestación de servicios',   value: 'Prestación de servicios' },
        { id: 'apr', label: 'Contrato de aprendizaje',   value: 'Contrato de aprendizaje' },
        { id: 'obra', label: 'Obra o labor',             value: 'Obra o labor' },
      ],
    },
    { id: q(C, 6), order: 6, text: '¿Cuál es tu fecha de ingreso?', type: 'date', required: true },
  ],
  fieldMappings: [
    { questionId: q(C, 0), fieldPath: 'contractInfo.assignment.company',       overwrite: false },
    { questionId: q(C, 1), fieldPath: 'contractInfo.assignment.area',          overwrite: false },
    { questionId: q(C, 2), fieldPath: 'contractInfo.assignment.position',      overwrite: false },
    { questionId: q(C, 3), fieldPath: 'contractInfo.assignment.project',       overwrite: false },
    { questionId: q(C, 4), fieldPath: 'contractInfo.assignment.location',      overwrite: false },
    { questionId: q(C, 5), fieldPath: 'contractInfo.contract.contractType',    overwrite: false },
    { questionId: q(C, 6), fieldPath: 'contractInfo.contract.startDate',       overwrite: false },
  ],
};

// ─────────────────────────────────────────────
// 9. SALARIO Y PREFERENCIAS
// ─────────────────────────────────────────────
const SL = 'sal';
const salarioPreferencias: Template = {
  title: 'Salario y Preferencias',
  description: 'Información salarial y preferencias de modalidad de trabajo.',
  targetRole: 'colaborador',
  active: true,
  isOnboarding: true,
  isRequired: false,
  allowMultipleCompletions: false,
  questions: [
    { id: q(SL, 0), order: 0, text: '¿Cuál es tu salario base mensual (en pesos COP)?', type: 'number', required: false },
    {
      id: q(SL, 1), order: 1, text: '¿Qué modalidad de trabajo prefieres?', type: 'select', required: false,
      options: [
        { id: 'pre', label: 'Presencial',  value: 'presencial' },
        { id: 'rem', label: 'Remoto',      value: 'remoto' },
        { id: 'hib', label: 'Híbrido',     value: 'híbrido' },
      ],
    },
    { id: q(SL, 2), order: 2, text: '¿Cuál es tu expectativa salarial a futuro (en pesos COP)?', type: 'number', required: false },
  ],
  fieldMappings: [
    { questionId: q(SL, 0), fieldPath: 'salaryInfo.baseSalary',           overwrite: false },
    { questionId: q(SL, 1), fieldPath: 'preferences.workModality',        overwrite: true },
    { questionId: q(SL, 2), fieldPath: 'preferences.salaryExpectation',   overwrite: true },
  ],
};

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
export const ONBOARDING_TEMPLATES: Template[] = [
  datosPersonales,
  ubicacionContacto,
  perfilProfesional,
  datosSocioeconomicos,
  familia,
  seguridadSocial,
  informacionBancaria,
  contratoAsignacion,
  salarioPreferencias,
];
