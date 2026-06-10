import { useState, useEffect } from 'react';
import { userService } from '../services/userService';
import { analyticsService } from '../services/analyticsService';
import { companyService } from '../services/companyService';
import { projectService } from '../services/projectService';
import type { MovementRecord } from '../models/types/Analytics';

// ========== Helpers para parsear datos del Excel ==========

/** Convierte número serial de Excel, Date o string a Date (medianoche local) */
function parseExcelDate(val: any): Date | undefined {
  if (!val) return undefined;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return undefined;
    // Re-construir en zona local para evitar desfase UTC
    return new Date(val.getFullYear(), val.getMonth(), val.getDate());
  }

  if (typeof val === 'number') {
    if (val <= 0) return undefined;
    const excelEpoch = new Date(1899, 11, 30);
    const tmp = new Date(excelEpoch.getTime() + val * 86400000);
    if (isNaN(tmp.getTime())) return undefined;
    return new Date(tmp.getFullYear(), tmp.getMonth(), tmp.getDate());
  }

  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return undefined;
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    // DD/MM/YYYY or D/M/YYYY (Colombia standard)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/').map(Number);
      const dt = new Date(y, m - 1, d);
      return isNaN(dt.getTime()) ? undefined : dt;
    }
    // DD-MM-YYYY
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
      const [d, m, y] = s.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return isNaN(dt.getTime()) ? undefined : dt;
    }
    // DD/MM/YY
    if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) {
      const [d, m, yy] = s.split('/').map(Number);
      const y = yy < 50 ? 2000 + yy : 1900 + yy;
      return new Date(y, m - 1, d);
    }
    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
      const [y, m, d] = s.split('/').map(Number);
      return new Date(y, m - 1, d);
    }
    return undefined;
  }
  return undefined;
}

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


const MOTIVOS_RETIRO = [
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
];

/** Normaliza MOTIVO del Excel al motivo estándar más cercano */
function normalizeRetiroReason(motivo: string | undefined): { reason: string; notes?: string } {
  if (!motivo) return { reason: 'Renuncia voluntaria' };
  const lower = motivo.toLowerCase().trim();

  if (lower.includes('fallec') || lower.includes('muerte'))           return { reason: 'Fallecimiento' };
  if (lower.includes('anulad'))                                        return { reason: 'Anulado' };
  if (lower.includes('renuncia') || lower.includes('voluntar'))       return { reason: 'Renuncia voluntaria' };
  if (lower.includes('sustit') || lower.includes('patronal'))         return { reason: 'Sustitución patronal' };
  if (lower.includes('justa causa'))                                   return { reason: 'Terminación contrato con justa causa' };
  if (lower.includes('sin justa') || lower.includes('injusta'))       return { reason: 'Terminación contrato sin justa causa' };
  if (lower.includes('aprendiz') && lower.includes('unilateral'))     return { reason: 'Terminación de contrato unilateral de aprendizaje' };
  if (lower.includes('aprendiz'))                                      return { reason: 'Terminación contrato de aprendizaje' };
  if (lower.includes('mutuo') || lower.includes('acuerdo'))           return { reason: 'Terminación de contrato por mutuo acuerdo' };
  if (lower.includes('obra') || lower.includes('labor'))              return { reason: 'Terminación de contrato por obra o labor' };
  if (lower.includes('prueba') || lower.includes('periodo'))          return { reason: 'Terminación de contrato por periodo de prueba' };
  if (lower.includes('fijo') || lower.includes('término fijo'))       return { reason: 'Terminación contrato a término fijo' };
  if (lower.includes('involuntar') || lower.includes('despid'))       return { reason: 'Terminación contrato sin justa causa' };

  // Si el texto del Excel coincide exactamente con algún motivo estándar
  const exact = MOTIVOS_RETIRO.find(m => m.toLowerCase() === lower);
  if (exact) return { reason: exact };

  return { reason: 'Renuncia voluntaria', notes: motivo };
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

            // Leer archivo Excel
            const XLSX = await import('xlsx');
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            // Debug: mostrar columnas del Excel en consola
            if (jsonData.length > 0) {
                const columns = Object.keys(jsonData[0] as any);
                console.log('📋 Columnas del Excel:', columns);
                console.log('📋 Primera fila:', jsonData[0]);
            }

            const usersToCreate: any[] = [];
            const movementsMap = new Map<string, Omit<MovementRecord, 'id' | 'createdAt'>>();

            for (const row of jsonData as any[]) {
                // --- Determinar email y nombre ---
                const email = (row['CORREO CORPORATIVO'] || row['CORREO ELECTRONICO PERSONAL'] || row['Email'] || row['email'] || row['Correo'] || '').toString().trim();
                const fullName = (row['APELLIDOS Y NOMBRES'] || row['Nombre Completo'] || row['Nombre'] || '').toString().trim();

                if (!email) continue; // Sin email no se puede crear usuario

                // --- Determinar role ---
                // ESTADO es la fuente de verdad. La fecha de retiro solo se guarda
                // como dato histórico pero no determina el rol.
                const estado = (row['ESTADO'] || '').toString().trim().toUpperCase();
                const fechaRetiro = parseExcelDate(row['FECHA RETIRO']);
                const isRetirado = estado === 'ANULADO'
                  || estado === 'ANULADA'
                  || estado === 'RETIRADO'
                  || estado === 'RETIRADA';
                const role = isRetirado ? 'excolaborador' : 'colaborador';

                // --- Fechas ---
                const fechaIngreso = parseExcelDate(row['FECHA DE INGRESO']);
                const fechaNacimiento = parseExcelDate(row['FECHA DE NACIMIENTO']);

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
                        documentType:          row['TIPO DOCUMENTO'] || undefined,
                        documentNumber:        row['CEDULA'] ? String(row['CEDULA']) : undefined,
                        documentExpeditionDate: parseExcelDate(row['FECHA EXPEDICION']) || undefined,
                        fullName:              fullName || undefined,
                        gender:                row['GENERO'] || undefined,
                        birthDate:             fechaNacimiento || undefined,
                        age:                   edad || undefined,
                        ageRange:              row['RANGO DE EDAD'] || undefined,
                        bloodType:             row['RH'] ? String(row['RH']).trim() : undefined,
                        maritalStatus:         row['ESTADO CIVIL'] || undefined,
                        nationality:           row['PAIS - NACIONALIDAD'] ? String(row['PAIS - NACIONALIDAD']).trim() : undefined,
                        position:              row['CARGO'] || undefined,
                        phone:                 row['TELEFONO PERSONAL'] ? String(row['TELEFONO PERSONAL']) : undefined,
                    },

                    location: {
                        country: row['PAIS - NACIONALIDAD'] || undefined,
                        state: row['DEPARTAMENTO DE RESIDENCIA'] || undefined,
                        department: row['DEPARTAMENTO DE RESIDENCIA'] || undefined,
                        city: row['CIUDAD DE RESIDENCIA'] || undefined,
                        address: row['DIRECCION VIVIENDA'] || undefined,
                        personalEmail: row['CORREO ELECTRONICO PERSONAL'] || undefined,
                        corporateEmail: row['CORREO CORPORATIVO'] || undefined,
                        corporatePhone: row['TELEFONO CORPORATIVO'] ? String(row['TELEFONO CORPORATIVO']) : undefined,
                    },

                    contractInfo: {
                        contract: {
                            contractType:      row['TIPO DE CONTRATO'] || undefined,
                            startDate:         fechaIngreso || undefined,
                            entryJustification: row['JUSTIFICACIÓN DE INGRESO'] || row['JUSTIFICACION DE INGRESO'] || undefined,
                        },
                        workConditions: {
                            workday:              row['JORNADA'] || undefined,
                            workModality:         row['MODALIDAD'] || undefined,
                            baseSalary:           sueldo || undefined,
                            productiveStartDate:  iniciaProductiva || undefined,
                            productiveEndDate:    finProductiva || undefined,
                        },
                        assignment: {
                            company: row['EMPRESA'] ? String(row['EMPRESA']).trim() : undefined,
                            project: row['PROYECTO'] ? String(row['PROYECTO']).trim() : undefined,
                            analyticalAccount: row['CUENTA ANALITICA'] ? String(row['CUENTA ANALITICA']) : undefined,
                            regional: row['REGIONAL'] || undefined,
                            sede: row['BASE DE OPERACION'] || undefined,
                            area: row['DEPARTAMENTO'] || undefined,
                            directSupervisor: row['JEFE INMEDIATO'] || undefined,
                            accountingProfile: row['PERFIL CONTABLE'] || undefined,
                            profile: row['PERFIL'] || undefined,
                            position: row['CARGO'] || undefined,
                            clientApplicationStatus: row['ESTADO APLICATIVO CLIENTE'] || undefined,
                        },
                    },

                    salaryInfo: {
                        salaryType:            row['TIPO DE SALARIO'] || undefined,
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
                        discountRecord:        row['Acta de Descuento'] || undefined,
                    },

                    socialSecurity: {
                        eps: row['EPS'] || undefined,
                        afp: row['AFP'] || undefined,
                        ccf: row['CCF'] || undefined,
                        severanceFund: row['CESANTIAS'] || undefined,
                        arlRiskLevel: row['RIESGO ARL'] ? String(row['RIESGO ARL']) : undefined,
                    },

                    bankingInfo: {
                        bankName: row['ENTIDAD BANCARIA'] || undefined,
                        accountType: row['TIPO DE CUENTA'] || undefined,
                        accountNumber: row['NUMERO DE CUENTA'] ? String(row['NUMERO DE CUENTA']) : undefined,
                    },

                    administrativeRecord: {
                        terminationDate:          fechaRetiro || undefined,
                        terminationReason:        row['MOTIVO'] || undefined,
                        terminationJustification: row['JUSTIFICACIÓN RETIRO'] || row['JUSTIFICACION RETIRO'] || undefined,
                        entryJustification:       row['JUSTIFICACIÓN DE INGRESO'] || row['JUSTIFICACION DE INGRESO'] || undefined,
                        lifeInsuranceStatus:      row['ESTADO SEGURO DE VIDA'] || undefined,
                        isMother:                 parseBool(row['MADRE']),
                        isPregnant:               parseBool(row['EMBARAZO']),
                        disciplinaryActions:      parseNumber(row['LLAMADOS DE ATENCION']) !== undefined
                                                    ? Math.floor(parseNumber(row['LLAMADOS DE ATENCION'])!) : undefined,
                        folderCompliance:         parseBool(row['CUMPLIMIENTO DE CARPETA 100%']),
                    },

                    professionalProfile: {
                        academicLevel:        row['NIVEL ACADEMICA'] || row['NIVEL ACADEMICO'] || undefined,
                        degree:               row['PROFESION'] || undefined,
                        professionalLicense:  row['COPNIA/CPNI'] ? String(row['COPNIA/CPNI']).trim() : undefined,
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
            for (const user of usersToCreate) {
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
            const results = await userService.createBatch(usersToCreate);

            // Limpiar movements previos de import antes de crear nuevos
            await analyticsService.deleteMovementsBySource('import-excel');

            // Solo crear movements para usuarios que fueron creados o actualizados exitosamente
            const successEmails = new Set([...results.success, ...results.updated]);
            const movementsToCreate: Omit<MovementRecord, 'id' | 'createdAt'>[] = [];
            for (const [key, movement] of movementsMap) {
                const email = key.split('|')[0];
                if (successEmails.has(email)) {
                    movementsToCreate.push(movement);
                }
            }

            let movementResults = { ingresos: 0, retiros: 0 };
            if (movementsToCreate.length > 0) {
                movementResults = await analyticsService.registerMovementsBatch(movementsToCreate);
            }

            // Recargar datos
            await loadUsers();
            await loadStats();

            // Auto-sincronizar estados de proyectos
            const syncResult = await projectService.syncStatuses();

            return {
                ...results,
                movements: movementResults,
                projectsInactivated: syncResult.inactivated,
            };
        } catch (err: any) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
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
        importUsersFromExcel,
        refreshUsers: loadUsers,
        updateUser,
        deleteUser,
        syncProjectStatuses,
        reactivateAllProjects,
    };
};