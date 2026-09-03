import { useState, useEffect } from 'react';
import { userService } from '../services/userService';
import { analyticsService } from '../services/analyticsService';
import { companyService } from '../services/companyService';
import { projectService } from '../services/projectService';
import type { MovementRecord } from '../models/types/Analytics';
import { normalizeRetiroReason } from '../domain/humanResources/terminationReasons';
import { parseExcelDate } from '../domain/humanResources/excelDate';

type ImportProgress = {
    percent: number;
    label: string;
};

const FORCE_EXCOLABORADOR_EMAILS = [
    'shuertasmartin@gmail.com',
    'jgutierrez@qualitrolcorp.com',
    'paula.acosta@asp.com',
    'saidy.gomez@asp.com',
    'ricardo.perea@asp.com',
    'frank.narvaez@asp.com',
    'marlon.amaya@asp.com',
    'natalia.garnica@asp.com',
    'ssantamaria@qualitrolcorp.com',
    'ricardo.quiroz@asp.com',
    'armando.varela@fluke.com',
    'manuel.deangulo@asp.com',
    'gerardo.valencia@asp.com',
    'carlos.arguello@asp.com',
    'rodriguezvane800@gmail.com',
    'paola.palacios@asp.com',
    'elizabeth.gutierrez@asp.com',
    'leidy.delgado@asp.com',
    'isabel.aguirre@asp.com',
    'michael.talerorodriguez@asp.com',
    'sara.ossa@asp.com',
    'nohora.campo@asp.com',
    'paola.barragan@asp.com',
    'maritza.swann@asp.com',
    'kurtude1@gmail.com',
    'dherran@inteegra.net.co',
    'c.avellaneda7@gmail.com',
    'edna.acosta@asp.com',
    'rafael.arango@asp.com',
    'gisela.guarin@asp.com',
    'sandra.rodriguez@asp.com',
    'jessica.bermudez@asp.com',
    'lina.beltran@asp.com',
    'david.ramirez@asp.com',
    'yineth.cerquera@asp.com',
    'est.laura.amado@unimilitar.edu.co',
    'i.sabella.0605@hotmail.com',
    'blanca.hernandez@asp.com',
    'nicolas.ocampo@asp.com',
    'paola.revelo@asp.com',
    'johan.aragonez@asp.com',
    'maria.ruiz@fluke.com',
    'julieth.criollo@asp.com',
    'yaneth.munoz@asp.com',
    'alejandro.moreno@asp.com',
    'luz.castellon@fluke.com',
    'pilar.nino@asp.com',
    'darwin.linares@asp.com',
    'argenis.sandoval@asp.com',
];

// ========== Helpers para parsear datos del Excel ==========

/** Normaliza SI/NO/X/1/TRUE a boolean */
function parseBool(val: any): boolean | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const s = String(val).trim().toUpperCase();
  if (['SI', 'SÍ', 'S', '1', 'TRUE', 'X', 'YES', 'Y'].includes(s)) return true;
  if (['NO', 'N', '0', 'FALSE'].includes(s)) return false;
  return undefined;
}

/** Limpia "$1.200.000" o "1200000" → number */
function parseNumber(val: any): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    // Remover $, espacios, puntos de miles y reemplazar coma decimal
    const cleaned = val.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}

function cleanText(val: any): string {
  return (val ?? '').toString().replace(/\uFEFF/g, '').replace(/[\r\n\t]/g, ' ').trim();
}

function cleanEmail(val: any): string {
  return cleanText(val).replace(/^"+|"+$/g, '').replace(/\s+/g, '').toLowerCase();
}

function cleanDocument(val: any): string {
  return cleanText(val).replace(/[.\s]/g, '').replace(/,/g, '');
}

function normalizeGender(val: any): string | undefined {
  const gender = cleanText(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (!gender) return undefined;
  if (['m', 'masculino', 'hombre', 'male'].includes(gender)) return 'Masculino';
  if (['f', 'femenino', 'mujer', 'female'].includes(gender)) return 'Femenino';
  return 'Otro';
}

function normalizeProperText(val: any): string | undefined {
  const text = cleanText(val).replace(/\s+/g, ' ');
  return text || undefined;
}

function normalizeHeader(val: string): string {
  return cleanText(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function getRowValue(row: any, names: string[]): any {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }

  const wanted = new Set(names.map(normalizeHeader));
  const match = Object.keys(row).find(key => wanted.has(normalizeHeader(key)));
  return match ? row[match] : undefined;
}

function isRetiredStatus(val: any): boolean {
  const estado = cleanText(val).toLowerCase();
  return estado.includes('retirad')
    || estado.includes('anulad')
    || estado.includes('terminad')
    || estado.includes('finalizad')
    || estado.includes('cancelad')
    || estado.includes('inactiv');
}

function hasNameTokens(fullName: string, tokens: string[]): boolean {
  const normalized = fullName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return tokens.every(token => normalized.includes(token));
}

function resolvePrimaryEmail(row: any, fullName: string): string {
  const corporateEmail = cleanEmail(row['CORREO CORPORATIVO']);
  const personalEmail = cleanEmail(row['CORREO ELECTRONICO PERSONAL']);
  const fallbackEmail = cleanEmail(row['Email'] || row['email'] || row['Correo']);

  // Daniela comparte el correo corporativo dherran@inteegra.net.co con otro registro
  // histórico. Usar su correo personal evita actualizar a Jhon Sebastian por error.
  if (
    corporateEmail === 'dherran@inteegra.net.co'
    && personalEmail
    && hasNameTokens(fullName, ['herran', 'pulido', 'daniela'])
  ) {
    return personalEmail;
  }

  return corporateEmail || personalEmail || fallbackEmail;
}

function mustStayExcolaborador(row: any, email: string): boolean {
  const forced = new Set(FORCE_EXCOLABORADOR_EMAILS);
  return [
    email,
    cleanEmail(row['CORREO CORPORATIVO']),
    cleanEmail(row['CORREO ELECTRONICO PERSONAL']),
    cleanEmail(row['Email'] || row['email'] || row['Correo']),
  ].some(candidate => candidate && forced.has(candidate));
}

function getUserImportKey(user: any): string {
  const documentNumber = user.personalData?.documentNumber;
  if (documentNumber) return `doc:${documentNumber}`;
  return `email:${cleanEmail(user.email)}`;
}


/** Elimina recursivamente campos con valor undefined (Firestore los rechaza) */
function removeUndefined(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  if (typeof obj === 'object') {
    const clean: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = removeUndefined(value);
      }
    }
    // No devolver objetos vacíos
    return Object.keys(clean).length > 0 ? clean : null;
  }
  return obj;
}

export const useUsers = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [stats, setStats] = useState({
        total: 0,
        colaboradores: 0,
        aspirantes: 0,
        excolaboradores: 0,
        descartados: 0,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);

    const updateImportProgress = (percent: number, label: string) => {
        setImportProgress({
            percent: Math.max(0, Math.min(100, Math.round(percent))),
            label,
        });
    };

    // Actualizar usuario
    const updateUser = async (userId: string, data: any) => {
        try {
            setLoading(true);
            setError(null);
            await userService.update(userId, data); // CAMBIADO
            await loadUsers();
            await loadStats();
        } catch (err: any) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Eliminar usuario
    const deleteUser = async (userId: string) => {
        try {
            setLoading(true);
            setError(null);
            await userService.delete(userId); // CAMBIADO
            await loadUsers();
            await loadStats();
        } catch (err: any) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Cargar usuarios
    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await userService.getAll(); // CAMBIADO
            setUsers(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Cargar estadísticas
    const loadStats = async () => {
        try {
            const data = await userService.getStats();
            setStats(data);
        } catch (err: any) {
            setError(err.message);
        }
    };

    // Importar usuarios desde Excel (mapeo completo ~65 columnas)
    const importUsersFromExcel = async (file: File) => {
        try {
            setLoading(true);
            setError(null);
            updateImportProgress(1, 'Leyendo archivo');

            // Leer archivo Excel
            const XLSX = await import('xlsx');
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            updateImportProgress(8, 'Analizando filas del Excel');

            // Debug: mostrar columnas del Excel en consola
            if (jsonData.length > 0) {
                const columns = Object.keys(jsonData[0] as any);
                console.log('📋 Columnas del Excel:', columns);
                console.log('📋 Primera fila:', jsonData[0]);
            }

            const usersToCreate: any[] = [];
            const movementsMap = new Map<string, Omit<MovementRecord, 'id' | 'createdAt'>>();

            for (const [index, row] of (jsonData as any[]).entries()) {
                if (index % 100 === 0 && jsonData.length > 0) {
                    updateImportProgress(8 + (index / jsonData.length) * 22, 'Normalizando datos');
                }

                // --- Determinar email y nombre ---
                const fullName = cleanText(row['APELLIDOS Y NOMBRES'] || row['Nombre Completo'] || row['Nombre']);
                const email = resolvePrimaryEmail(row, fullName);

                if (!email) continue; // Sin email no se puede crear usuario

                // --- Determinar role ---
                const fechaRetiro = parseExcelDate(row['FECHA RETIRO']);
                const isRetirado = isRetiredStatus(row['ESTADO']) || mustStayExcolaborador(row, email);
                const role = isRetirado ? 'excolaborador' : 'colaborador';

                // --- Fechas ---
                const fechaIngreso = parseExcelDate(row['FECHA DE INGRESO'], { minYear: 1950 });
                const fechaNacimientoRaw = getRowValue(row, [
                  'FECHA DE NACIMIENTO',
                  'FECHA NACIMIENTO',
                  'F. NACIMIENTO',
                  'NACIMIENTO',
                ]);
                const fechaNacimiento = parseExcelDate(fechaNacimientoRaw, {
                  minYear: 1900,
                  maxYear: new Date().getFullYear(),
                });

                // --- Números ---
                const sueldo = parseNumber(row['Sueldo']);
                const auxTransporte = parseNumber(row['Aux. de transporte/Aux. de conectividad digital'] || row['Aux. de transporte/conectividad']);
                const auxAlimentacion = parseNumber(row['Auxilio Alimentacion'] || row['Auxilio de Alimentación'] || row['Auxilio de Alimentación 2023']);
                const auxOperacional = parseNumber(row['Auxilio Operacional u otros auxilios no salariales']);
                const auxRodamiento = parseNumber(row['Auxilio Rodamiento']);
                const auxHerramientas = parseNumber(row['Auxilio Herramientas']);
                const auxComunicacion = parseNumber(row['Auxilio Comunicacion']);
                const kpiSalarial = parseNumber(row['KPI Salarial']);
                const edad = parseNumber(row['EDAD']) !== undefined ? Math.floor(parseNumber(row['EDAD'])!) : undefined;
                const salario2022 = parseNumber(row['SALARIO BASICO 2022']);
                const salario2023 = parseNumber(row['SALARIO BASICO 2023']);
                const salario2024 = parseNumber(row['SALARIO BASICO 2024']);
                const auxSoporte       = parseNumber(row['Auxilio de Soporte']);
                const iniciaProductiva = parseExcelDate(row['INICIA PRODUCTIVA']);
                const finProductiva    = parseExcelDate(row['FIN PRODUCTIVA']);

                // --- Construir objeto User completo ---
                const user: any = {
                    email,
                    fullName,
                    role,
                    profileCompleted: false,
                    completedOnboardings: [],

                    personalData: {
                        documentType:          normalizeProperText(row['TIPO DOCUMENTO']),
                        documentNumber:        row['CEDULA'] ? cleanDocument(row['CEDULA']) : undefined,
                        documentExpeditionDate: parseExcelDate(row['FECHA EXPEDICION']) || undefined,
                        fullName:              fullName || undefined,
                        gender:                normalizeGender(row['GENERO']),
                        birthDate:             fechaNacimiento || undefined,
                        age:                   edad || undefined,
                        ageRange:              normalizeProperText(row['RANGO DE EDAD']),
                        bloodType:             normalizeProperText(row['RH']),
                        maritalStatus:         normalizeProperText(row['ESTADO CIVIL']),
                        nationality:           normalizeProperText(row['PAIS - NACIONALIDAD']),
                        position:              normalizeProperText(row['CARGO']),
                        phone:                 row['TELEFONO PERSONAL'] ? String(row['TELEFONO PERSONAL']) : undefined,
                    },

                    location: {
                        country: normalizeProperText(row['PAIS - NACIONALIDAD']),
                        state: normalizeProperText(row['DEPARTAMENTO DE RESIDENCIA']),
                        department: normalizeProperText(row['DEPARTAMENTO DE RESIDENCIA']),
                        city: normalizeProperText(row['CIUDAD DE RESIDENCIA']),
                        address: normalizeProperText(row['DIRECCION VIVIENDA']),
                        personalEmail: cleanEmail(row['CORREO ELECTRONICO PERSONAL']) || undefined,
                        corporateEmail: cleanEmail(row['CORREO CORPORATIVO']) || undefined,
                        corporatePhone: row['TELEFONO CORPORATIVO'] ? String(row['TELEFONO CORPORATIVO']) : undefined,
                    },

                    contractInfo: {
                        contract: {
                            contractType:      normalizeProperText(row['TIPO DE CONTRATO']),
                            startDate:         fechaIngreso || undefined,
                            entryJustification: normalizeProperText(row['JUSTIFICACIÓN DE INGRESO'] || row['JUSTIFICACION DE INGRESO']),
                        },
                        workConditions: {
                            workday:              normalizeProperText(row['JORNADA']),
                            workModality:         normalizeProperText(row['MODALIDAD']),
                            baseSalary:           sueldo || undefined,
                            productiveStartDate:  iniciaProductiva || undefined,
                            productiveEndDate:    finProductiva || undefined,
                        },
                        assignment: {
                            company: normalizeProperText(row['EMPRESA']),
                            project: normalizeProperText(row['PROYECTO']),
                            analyticalAccount: normalizeProperText(row['CUENTA ANALITICA']),
                            regional: normalizeProperText(row['REGIONAL']),
                            sede: normalizeProperText(row['BASE DE OPERACION']),
                            area: normalizeProperText(row['DEPARTAMENTO']),
                            directSupervisor: normalizeProperText(row['JEFE INMEDIATO']),
                            accountingProfile: normalizeProperText(row['PERFIL CONTABLE']),
                            profile: normalizeProperText(row['PERFIL']),
                            position: normalizeProperText(row['CARGO']),
                            clientApplicationStatus: normalizeProperText(row['ESTADO APLICATIVO CLIENTE']),
                        },
                    },

                    salaryInfo: {
                        salaryType:            normalizeProperText(row['TIPO DE SALARIO']),
                        baseSalary:            sueldo || undefined,
                        baseSalary2022:        salario2022 || undefined,
                        baseSalary2023:        salario2023 || undefined,
                        baseSalary2024:        salario2024 || undefined,
                        transportAllowance:    auxTransporte || undefined,
                        mealAllowance:         auxAlimentacion || undefined,
                        operationalAllowance:  auxOperacional || undefined,
                        supportAllowance:      auxSoporte || undefined,
                        vehicleAllowance:      auxRodamiento || undefined,
                        toolsAllowance:        auxHerramientas || undefined,
                        communicationAllowance: auxComunicacion || undefined,
                        salaryKpi:             kpiSalarial || undefined,
                        discountRecord:        normalizeProperText(row['Acta de Descuento']),
                    },

                    socialSecurity: {
                        eps: normalizeProperText(row['EPS']),
                        afp: normalizeProperText(row['AFP']),
                        ccf: normalizeProperText(row['CCF']),
                        severanceFund: normalizeProperText(row['CESANTIAS']),
                        arlRiskLevel: row['RIESGO ARL'] ? String(row['RIESGO ARL']) : undefined,
                    },

                    bankingInfo: {
                        bankName: normalizeProperText(row['ENTIDAD BANCARIA']),
                        accountType: normalizeProperText(row['TIPO DE CUENTA']),
                        accountNumber: row['NUMERO DE CUENTA'] ? String(row['NUMERO DE CUENTA']) : undefined,
                    },

                    administrativeRecord: {
                        terminationDate:          fechaRetiro || undefined,
                        terminationReason:        normalizeProperText(row['MOTIVO']),
                        terminationJustification: normalizeProperText(row['JUSTIFICACIÓN RETIRO'] || row['JUSTIFICACION RETIRO']),
                        entryJustification:       normalizeProperText(row['JUSTIFICACIÓN DE INGRESO'] || row['JUSTIFICACION DE INGRESO']),
                        lifeInsuranceStatus:      normalizeProperText(row['ESTADO SEGURO DE VIDA']),
                        isMother:                 parseBool(row['MADRE']),
                        isPregnant:               parseBool(row['EMBARAZO']),
                        disciplinaryActions:      parseNumber(row['LLAMADOS DE ATENCION']) !== undefined
                                                    ? Math.floor(parseNumber(row['LLAMADOS DE ATENCION'])!) : undefined,
                        folderCompliance:         parseBool(row['CUMPLIMIENTO DE CARPETA 100%']),
                    },

                    professionalProfile: {
                        academicLevel:        normalizeProperText(row['NIVEL ACADEMICA'] || row['NIVEL ACADEMICO']),
                        degree:               normalizeProperText(row['PROFESION']),
                        professionalLicense:  normalizeProperText(row['COPNIA/CPNI']),
                    },
                };

                // Limpiar undefined antes de enviar a Firestore
                const cleanUser: any = { email, fullName, role, profileCompleted: false, completedOnboardings: [] };
                const cleanPersonal = removeUndefined(user.personalData);
                const cleanLocation = removeUndefined(user.location);
                const cleanContract = removeUndefined(user.contractInfo);
                const cleanSalary = removeUndefined(user.salaryInfo);
                const cleanSocial = removeUndefined(user.socialSecurity);
                const cleanBanking = removeUndefined(user.bankingInfo);
                const cleanAdmin = removeUndefined(user.administrativeRecord);
                const cleanProf = removeUndefined(user.professionalProfile);

                if (cleanPersonal) cleanUser.personalData = cleanPersonal;
                if (cleanLocation) cleanUser.location = cleanLocation;
                if (cleanContract) cleanUser.contractInfo = cleanContract;
                if (cleanSalary) cleanUser.salaryInfo = cleanSalary;
                if (cleanSocial) cleanUser.socialSecurity = cleanSocial;
                if (cleanBanking) cleanUser.bankingInfo = cleanBanking;
                if (cleanAdmin) cleanUser.administrativeRecord = cleanAdmin;
                if (cleanProf) cleanUser.professionalProfile = cleanProf;

                usersToCreate.push(cleanUser);

                // --- Preparar movements (asociados al email) ---
                const company = row['EMPRESA'] || undefined;
                const area = row['DEPARTAMENTO'] || undefined;

                if (fechaIngreso) {
                    movementsMap.set(email + '|ingreso', {
                        type: 'ingreso',
                        userId: '',
                        userName: fullName,
                        userEmail: email,
                        date: fechaIngreso,
                        company,
                        area,
                        createdBy: 'import-excel',
                    });
                }

                // Generar retiro si tiene fecha, o si es excolaborador
                const fechaRetiroFinal = fechaRetiro || (isRetirado ? new Date() : null);
                if (fechaRetiroFinal) {
                    const { reason, notes } = normalizeRetiroReason(row['MOTIVO']);
                    movementsMap.set(email + '|retiro', {
                        type: 'retiro',
                        userId: '',
                        userName: fullName,
                        userEmail: email,
                        date: fechaRetiroFinal,
                        reason,
                        cost: sueldo,
                        company,
                        area,
                        notes,
                        createdBy: 'import-excel',
                    });
                }
            }

            const usersToImport = Array.from(
                new Map(usersToCreate.map(user => [getUserImportKey(user), user])).values()
            );
            const duplicateRowsMerged = usersToCreate.length - usersToImport.length;
            updateImportProgress(32, 'Preparando empresas y cuentas analíticas');

            // ── Auto-crear empresas y proyectos desde el Excel ──────────────

            // 1. Recolectar empresas únicas (con NIT) y pares empresa::proyecto
            const companyMap = new Map<string, string>(); // nombre → NIT
            const projectPairs = new Map<string, string>(); // "empresa::proyecto" → empresaNombre

            for (const row of jsonData as any[]) {
                const empresa = (row['EMPRESA'] || '').toString().trim();
                const nit     = (row['NIT'] || '').toString().trim();
                const proyecto = (row['PROYECTO'] || '').toString().trim();
                if (empresa) companyMap.set(empresa, nit);
                if (empresa && proyecto) projectPairs.set(`${empresa}::${proyecto}`, empresa);
            }

            // 2. Crear empresas que no existan, mapear nombre → id
            const existingCompanies = await companyService.getAll();
            const companyNameToId = new Map<string, string>();
            for (const c of existingCompanies) companyNameToId.set(c.name, c.id);

            for (const [name, nit] of companyMap) {
                if (!companyNameToId.has(name)) {
                    const id = await companyService.create({
                        name, nit, active: true,
                        address: '', phone: '', email: '', logo: '', regional: '', baseDeOperacion: '',
                    });
                    companyNameToId.set(name, id);
                }
            }

            // 3. Crear proyectos que no existan, mapear "empresa::proyecto" → id
            updateImportProgress(42, 'Validando cuentas analíticas');
            const existingProjects = await projectService.getAll();
            const projectKeyToId = new Map<string, string>();
            for (const p of existingProjects) {
                projectKeyToId.set(`${(p.companyName || '').toLowerCase()}::${p.name.toLowerCase()}`, p.id);
            }

            for (const [key, companyName] of projectPairs) {
                const lowerKey = key.toLowerCase();
                if (!projectKeyToId.has(lowerKey)) {
                    const projectName = key.split('::')[1];
                    const companyId = companyNameToId.get(companyName) || '';
                    const id = await projectService.create({
                        name: projectName,
                        companyId,
                        companyName,
                        status: 'activo',
                        priority: 'media',
                        sede: '',
                    });
                    projectKeyToId.set(lowerKey, id);
                }
            }

            // 4. Inyectar companyId y projectId en cada usuario
            for (const user of usersToImport) {
                const empresa = user.contractInfo?.assignment?.company;
                const proyecto = user.contractInfo?.assignment?.project;
                const companyId = empresa ? companyNameToId.get(empresa) : undefined;
                const projectId = empresa && proyecto
                    ? projectKeyToId.get(`${empresa.toLowerCase()}::${proyecto.toLowerCase()}`)
                    : undefined;
                if (companyId) {
                    user.contractInfo.assignment.companyId = companyId;
                    user.companyIds = [companyId];
                }
                if (projectId) {
                    user.contractInfo.assignment.projectId = projectId;
                    user.projectIds = [projectId];
                }
            }

            // ────────────────────────────────────────────────────────────────

            // Crear/actualizar usuarios en batch
            updateImportProgress(55, 'Guardando usuarios');
            const results = await userService.createBatch(usersToImport);

            updateImportProgress(68, 'Asegurando excolaboradores');
            const forcedExcolaboradores = await userService.markEmailsAsExcolaborador(FORCE_EXCOLABORADOR_EMAILS);

            // Limpiar movements previos de import antes de crear nuevos
            updateImportProgress(72, 'Actualizando movimientos');
            await analyticsService.deleteMovementsBySource('import-excel');

            // Lo que quede tras el borrado es todo movimiento registrado a mano (no de import);
            // no duplicar un ingreso/retiro que ya fue registrado manualmente para esa persona.
            const existingMovements = await analyticsService.getMovements();
            const manualMovementKeys = new Set(
                existingMovements.map(m => `${(m.userEmail || '').toLowerCase()}|${m.type}`)
            );

            // Solo crear movements para usuarios que fueron creados o actualizados exitosamente
            const successEmails = new Set([...results.success, ...results.updated]);
            const movementsToCreate: Omit<MovementRecord, 'id' | 'createdAt'>[] = [];
            for (const [key, movement] of movementsMap) {
                const email = key.split('|')[0];
                if (!successEmails.has(email)) continue;
                if (manualMovementKeys.has(`${email}|${movement.type}`)) continue;
                movementsToCreate.push(movement);
            }

            let movementResults = { ingresos: 0, retiros: 0 };
            if (movementsToCreate.length > 0) {
                movementResults = await analyticsService.registerMovementsBatch(movementsToCreate);
            }

            // Recargar datos
            updateImportProgress(84, 'Recargando usuarios');
            await loadUsers();
            await loadStats();

            // Auto-sincronizar estados de proyectos
            updateImportProgress(92, 'Sincronizando cuentas analíticas');
            const syncResult = await projectService.syncStatuses();
            updateImportProgress(100, 'Importación completada');

            return {
                ...results,
                duplicateRowsMerged,
                forcedExcolaboradores,
                movements: movementResults,
                projectsInactivated: syncResult.inactivated,
            };
        } catch (err: any) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
            setTimeout(() => setImportProgress(null), 1200);
        }
    };

    const syncProjectStatuses = async (): Promise<{ inactivated: number; reactivated: number }> => {
        try {
            setLoading(true);
            setError(null);
            return await projectService.syncStatuses();
        } catch (err: any) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const reactivateAllProjects = async (): Promise<{ reactivated: number }> => {
        try {
            setLoading(true);
            setError(null);
            return await projectService.reactivateAll();
        } catch (err: any) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
        loadStats();
    }, []);

    return {
        users,
        stats,
        loading,
        error,
        importProgress,
        importUsersFromExcel,
        refreshUsers: loadUsers,
        updateUser,
        deleteUser,
        syncProjectStatuses,
        reactivateAllProjects,
    };
};
