export type HrPreviewAction = 'create' | 'update' | 'unchanged' | 'conflict' | 'rejected';

export interface HrPreviewIssue {
  row: number;
  action: HrPreviewAction;
  reasons: string[];
}

export interface HrExcelPreview {
  fileName: string;
  sheetName: string;
  totalRows: number;
  activeRows: number;
  retiredRows: number;
  create: number;
  update: number;
  unchanged: number;
  conflicts: number;
  rejected: number;
  invalidEmails: number;
  withoutPlatformAccess: number;
  duplicateDocumentGroups: number;
  duplicateEmailGroups: number;
  multiEmploymentEmployees: number;
  issues: HrPreviewIssue[];
}

export interface HrImportRow {
  sourceRow: number;
  documentNumber: string;
  fullName: string;
  status: 'active' | 'retired';
  identityUserId?: string;
  employee: Record<string, unknown>;
  employment: Record<string, unknown>;
  payroll: Record<string, unknown>;
  banking: Record<string, unknown>;
  socialSecurity: Record<string, unknown>;
}

export interface HrImportPlan {
  fileName: string;
  sheetName: string;
  rows: HrImportRow[];
}

const text = (value: unknown) => String(value ?? '').trim();
const comparable = (value: unknown) => text(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
const documentNumber = (value: unknown) => text(value).replace(/\D/g, '');
const email = (value: unknown) => text(value).toLowerCase();
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const retired = (value: unknown) => {
  const status = comparable(value);
  return ['retirad', 'inactiv', 'terminad', 'finalizad', 'anulad'].some(token => status.includes(token));
};

const compact = (value: Record<string, unknown>) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== '' && item !== null && item !== undefined),
);
const numberValue = (value: unknown) => {
  // Estas columnas son valores enteros en COP. XLSX puede formatear 249000
  // como "$249,000"; la coma es separador de miles, no decimal.
  const normalized = text(value).replace(/[^\d-]/g, '');
  const parsed = Number(normalized);
  return normalized && Number.isFinite(parsed) ? parsed : undefined;
};
const dateValue = (value: unknown) => text(value) || undefined;

export function buildHrImportPlan(
  fileName: string,
  rows: Record<string, unknown>[],
  existingUsers: any[],
): HrImportPlan {
  const usersByDocument = new Map<string, any>();
  existingUsers.forEach(user => {
    const key = documentNumber(user.personalData?.documentNumber);
    if (key && !usersByDocument.has(key)) usersByDocument.set(key, user);
  });

  const meaningfulRows = rows
    .map((row, index) => ({ row, sourceRow: index + 2 }))
    .filter(({ row }) => [row.CEDULA, row['APELLIDOS Y NOMBRES'], row.ESTADO, row.EMPRESA, row.PROYECTO]
      .some(value => text(value) !== ''));

  return {
    fileName,
    sheetName: 'BD - DIRECTOS',
    rows: meaningfulRows.flatMap(({ row, sourceRow }) => {
      const doc = documentNumber(row.CEDULA);
      const fullName = text(row['APELLIDOS Y NOMBRES']);
      if (!doc || !fullName) return [];
      const currentUser = usersByDocument.get(doc);
      const corporateEmail = email(row['CORREO CORPORATIVO']);
      const personalEmail = email(row['CORREO ELECTRONICO PERSONAL']);
      const status = retired(row.ESTADO) ? 'retired' as const : 'active' as const;
      return [{
        sourceRow,
        documentNumber: doc,
        fullName,
        status,
        identityUserId: currentUser?.id,
        employee: compact({
          documentType: text(row['TIPO DOCUMENTO']), documentNumber: doc, fullName, status,
          corporateEmail: validEmail(corporateEmail) ? corporateEmail : currentUser?.location?.corporateEmail,
          personalEmail: validEmail(personalEmail) ? personalEmail : currentUser?.location?.personalEmail,
          personalPhone: text(row['TELEFONO PERSONAL']), corporatePhone: text(row['TELEFONO CORPORATIVO']),
          birthDate: dateValue(row['FECHA DE NACIMIENTO']), gender: text(row.GENERO),
          nationality: text(row['PAIS - NACIONALIDAD']),
          residence: compact({ department: text(row['DEPARTAMENTO DE RESIDENCIA']), city: text(row['CIUDAD DE RESIDENCIA']), address: text(row['DIRECCION VIVIENDA']) }),
          education: compact({ academicLevel: text(row['NIVEL ACADEMICA'] || row['NIVEL ACADEMICO']), profession: text(row.PROFESION), professionalLicense: text(row['COPNIA/CPNI']) }),
        }),
        employment: compact({
          employeeId: doc, status, companyName: text(row.EMPRESA), projectName: text(row.PROYECTO),
          position: text(row.CARGO), supervisor: text(row['JEFE INMEDIATO']), contractType: text(row['TIPO DE CONTRATO']),
          startDate: dateValue(row['FECHA DE INGRESO']), endDate: dateValue(row['FECHA RETIRO']),
          workday: text(row.JORNADA), modality: text(row.MODALIDAD), regional: text(row.REGIONAL),
          baseLocation: text(row['BASE DE OPERACION']), area: text(row.DEPARTAMENTO), analyticalAccount: text(row['CUENTA ANALITICA']),
          terminationReason: text(row['MOTIVO DE RETIRO'] || row['MOTIVO RETIRO']),
          terminationCost: numberValue(row['COSTO DE RETIRO'] || row['COSTO RETIRO']),
          sourceRow,
        }),
        payroll: compact({
          salaryType: text(row['TIPO DE SALARIO']), baseSalary: numberValue(row.Sueldo),
          transportAllowance: numberValue(row['Aux. de transporte/Aux. de conectividad digital'] || row['Aux. de transporte/conectividad']),
          operationalAllowance: numberValue(row['Auxilio Operacional u otros auxilios no salariales']),
          foodAllowance: numberValue(row['Auxilio Alimentacion'] || row['Auxilio de Alimentación']),
          supportAllowance: numberValue(row['Auxilio de Soporte']), vehicleAllowance: numberValue(row['Auxilio Rodamiento']),
          toolsAllowance: numberValue(row['Auxilio Herramientas']), communicationAllowance: numberValue(row['Auxilio Comunicacion']),
          salaryKpi: numberValue(row['KPI Salarial']), discountRecord: text(row['Acta de Descuento']),
        }),
        banking: compact({ bankName: text(row['ENTIDAD BANCARIA']), accountType: text(row['TIPO DE CUENTA']), accountNumber: text(row['NUMERO DE CUENTA']) }),
        socialSecurity: compact({ eps: text(row.EPS), afp: text(row.AFP), ccf: text(row.CCF), severanceFund: text(row.CESANTIAS), arlRiskLevel: text(row['RIESGO ARL']) }),
      }];
    }),
  };
}

function primaryEmail(row: Record<string, unknown>) {
  return email(row['CORREO CORPORATIVO']) || email(row['CORREO ELECTRONICO PERSONAL']);
}

function currentFingerprint(row: Record<string, unknown>, resolvedEmail?: string) {
  return [
    row['APELLIDOS Y NOMBRES'], resolvedEmail ?? primaryEmail(row), retired(row.ESTADO) ? 'retired' : 'active',
    row.EMPRESA, row.PROYECTO, row.CARGO, row['TIPO DE CONTRATO'],
  ].map(comparable).join('|');
}

function storedFingerprint(user: any) {
  return [
    user.fullName, user.location?.corporateEmail || user.location?.personalEmail || user.email,
    user.role === 'excolaborador' ? 'retired' : 'active',
    user.contractInfo?.assignment?.company, user.contractInfo?.assignment?.project,
    user.contractInfo?.assignment?.position || user.personalData?.position,
    user.contractInfo?.contract?.contractType,
  ].map(comparable).join('|');
}

export function analyzeHrRows(
  fileName: string,
  rows: Record<string, unknown>[],
  existingUsers: any[],
): HrExcelPreview {
  const sheetName = 'BD - DIRECTOS';
  const required = ['CEDULA', 'APELLIDOS Y NOMBRES', 'ESTADO', 'EMPRESA'];
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const missing = required.filter(header => !headers.includes(header));
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}`);

  // Excel puede conservar formato o fórmulas vacías debajo de la última fila
  // visible. Solo considerar filas con algún dato funcional de persona/vínculo.
  const indexedRows = rows
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => [
      row.CEDULA,
      row['APELLIDOS Y NOMBRES'],
      row.ESTADO,
      row.EMPRESA,
      row.PROYECTO,
      row['CORREO CORPORATIVO'],
      row['CORREO ELECTRONICO PERSONAL'],
    ].some(value => text(value) !== ''));

  const byDocument = new Map<string, { row: Record<string, unknown>; rowNumber: number }[]>();
  const byEmail = new Map<string, number[]>();
  const issues: HrPreviewIssue[] = [];
  let activeRows = 0;
  let retiredRows = 0;
  let invalidEmails = 0;
  let withoutPlatformAccess = 0;

  indexedRows.forEach(({ row, rowNumber }) => {
    const doc = documentNumber(row.CEDULA);
    const reasons: string[] = [];
    if (!doc) reasons.push('Sin cédula');
    if (retired(row.ESTADO)) retiredRows++; else activeRows++;
    if (reasons.length) issues.push({ row: rowNumber, action: 'rejected', reasons });
    if (doc) {
      if (!byDocument.has(doc)) byDocument.set(doc, []);
      byDocument.get(doc)!.push({ row, rowNumber });
    }
    for (const candidate of new Set([
      email(row['CORREO CORPORATIVO']), email(row['CORREO ELECTRONICO PERSONAL']),
    ].filter(Boolean))) {
      if (!byEmail.has(candidate)) byEmail.set(candidate, []);
      byEmail.get(candidate)!.push(rowNumber);
    }
  });

  const usersByDocument = new Map(existingUsers
    .map(user => [documentNumber(user.personalData?.documentNumber), user] as const).filter(([key]) => key));
  const usersByEmail = new Map<string, any>();
  existingUsers.forEach(user => {
    [user.email, user.location?.corporateEmail, user.location?.personalEmail].forEach(candidate => {
      const key = email(candidate);
      if (key && !usersByEmail.has(key)) usersByEmail.set(key, user);
    });
  });

  let create = 0;
  let update = 0;
  let unchanged = 0;
  let conflicts = 0;
  let multiEmploymentEmployees = 0;

  for (const [doc, entries] of byDocument) {
    const activeEntries = entries.filter(entry => !retired(entry.row.ESTADO));
    const activeAssignments = new Map<string, typeof activeEntries>();
    activeEntries.forEach(entry => {
      const assignmentKey = [entry.row.EMPRESA, entry.row.PROYECTO].map(comparable).join('|');
      if (!activeAssignments.has(assignmentKey)) activeAssignments.set(assignmentKey, []);
      activeAssignments.get(assignmentKey)!.push(entry);
    });
    if (activeAssignments.size > 1) multiEmploymentEmployees++;
    const duplicateActiveAssignment = [...activeAssignments.values()].find(group => group.length > 1);
    if (duplicateActiveAssignment) {
      conflicts++;
      issues.push({
        row: duplicateActiveAssignment[0].rowNumber,
        action: 'conflict',
        reasons: [`Relación activa duplicada para la misma cédula, empresa y proyecto: filas ${duplicateActiveAssignment.map(entry => entry.rowNumber).join(', ')}`],
      });
      continue;
    }

    const selected = activeEntries[0] ?? entries[entries.length - 1];
    const mail = primaryEmail(selected.row);
    const hasValidEmail = validEmail(mail);
    const existingByDocument = usersByDocument.get(doc);
    const existing = existingByDocument ?? (hasValidEmail ? usersByEmail.get(mail) : undefined);
    const selectedReasons: string[] = [];
    if (!text(selected.row['APELLIDOS Y NOMBRES'])) selectedReasons.push('Sin nombre');
    if (!hasValidEmail) {
      invalidEmails++;
      if (!existingByDocument) {
        withoutPlatformAccess++;
        issues.push({
          row: selected.rowNumber,
          action: 'create',
          reasons: [mail ? 'Correo inválido; se creará expediente sin acceso a plataforma' : 'Sin correo; se creará expediente sin acceso a plataforma'],
        });
      } else issues.push({
        row: selected.rowNumber,
        action: 'update',
        reasons: [mail ? 'Correo inválido; se conservará el correo actual' : 'Sin correo; se conservará el correo actual'],
      });
    }
    if (selectedReasons.length) {
      issues.push({ row: selected.rowNumber, action: 'rejected', reasons: selectedReasons });
      continue;
    }
    if (!existing) create++;
    else if (currentFingerprint(
      selected.row,
      hasValidEmail ? mail : existing.location?.corporateEmail || existing.location?.personalEmail || existing.email,
    ) === storedFingerprint(existing)) unchanged++;
    else update++;
  }

  return {
    fileName,
    sheetName,
    totalRows: indexedRows.length,
    activeRows,
    retiredRows,
    create,
    update,
    unchanged,
    conflicts,
    rejected: issues.filter(issue => issue.action === 'rejected').length,
    invalidEmails,
    withoutPlatformAccess,
    duplicateDocumentGroups: [...byDocument.values()].filter(group => group.length > 1).length,
    duplicateEmailGroups: [...byEmail.values()].filter(group => group.length > 1).length,
    multiEmploymentEmployees,
    issues: issues.sort((a, b) => {
      const priority: Record<HrPreviewAction, number> = {
        conflict: 0,
        rejected: 1,
        update: 2,
        create: 3,
        unchanged: 4,
      };
      return priority[a.action] - priority[b.action] || a.row - b.row;
    }),
  };
}
