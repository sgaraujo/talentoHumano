import { useState, useEffect } from 'react';
import { userService } from '../services/userService';
import { analyticsService } from '../services/analyticsService';
import type { MovementRecord } from '../models/types/Analytics';

// ========== Helpers para parsear datos del Excel ==========

/** Convierte número serial de Excel o string a Date */
function parseExcelDate(val: any): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    // Excel serial date: días desde 1900-01-01 (con bug del leap year 1900)
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    return isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }
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

/** "SI"/"SÍ"/"S" → true, "NO"/"N" → false */
function parseBool(val: any): boolean | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  if (typeof val === 'boolean') return val;
  const str = String(val).trim().toUpperCase();
  if (['SI', 'SÍ', 'S', 'TRUE', '1'].includes(str)) return true;
  if (['NO', 'N', 'FALSE', '0'].includes(str)) return false;
  return undefined;
}

/** Normaliza MOTIVO de retiro a reason del MovementRecord */
function normalizeRetiroReason(motivo: string | undefined): { reason: string; notes?: string } {
  if (!motivo) return { reason: 'voluntario' };
  const lower = motivo.toLowerCase();
  if (lower.includes('voluntar')) return { reason: 'voluntario' };
  if (lower.includes('involuntar') || lower.includes('despid') || lower.includes('justa causa')) {
    return { reason: 'involuntario' };
  }
  return { reason: 'voluntario', notes: motivo };
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
                const estado = (row['ESTADO'] || '').toString().toUpperCase();
                const fechaRetiro = parseExcelDate(row['FECHA RETIRO']);
                const isRetirado = fechaRetiro || estado.includes('RETIRADO') || estado.includes('INACTIVO');
                const role = isRetirado ? 'excolaborador' : 'colaborador';

                // --- Fechas ---
                const fechaIngreso = parseExcelDate(row['FECHA DE INGRESO']);
                const fechaNacimiento = parseExcelDate(row['FECHA DE NACIMIENTO']);
                const productiveStart = parseExcelDate(row['INICIA PRODUCTIVA']);
                const productiveEnd = parseExcelDate(row['FIN PRODUCTIVA']);

                // --- Números ---
                const sueldo = parseNumber(row['Sueldo']);
                const auxTransporte = parseNumber(row['Aux. de transporte/conectividad']);
                const auxAlimentacion = parseNumber(row['Auxilio Alimentacion']);
                const auxRodamiento = parseNumber(row['Auxilio Rodamiento']);
                const auxHerramientas = parseNumber(row['Auxilio Herramientas']);
                const auxComunicacion = parseNumber(row['Auxilio Comunicacion']);
                const kpiSalarial = parseNumber(row['KPI Salarial']);
                const edad = parseNumber(row['EDAD']);
                const llamadosAtencion = parseNumber(row['LLAMADOS DE ATENCION']);

                // --- Construir objeto User completo ---
                const user: any = {
                    email,
                    fullName,
                    role,
                    profileCompleted: false,
                    completedOnboardings: [],

                    personalData: {
                        documentType: row['TIPO DOCUMENTO'] || undefined,
                        documentNumber: row['CEDULA'] ? String(row['CEDULA']) : undefined,
                        fullName: fullName || undefined,
                        gender: row['GENERO'] || undefined,
                        birthDate: fechaNacimiento || undefined,
                        age: edad || undefined,
                        ageRange: row['RANGO DE EDAD'] || undefined,
                        bloodType: row['RH'] || undefined,
                        maritalStatus: row['ESTADO CIVIL'] || undefined,
                        nationality: row['PAIS - NACIONALIDAD'] || undefined,
                        position: row['CARGO'] || undefined,
                        phone: row['TELEFONO PERSONAL'] ? String(row['TELEFONO PERSONAL']) : undefined,
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
                            contractType: row['TIPO DE CONTRATO'] || undefined,
                            startDate: fechaIngreso || undefined,
                        },
                        workConditions: {
                            workday: row['JORNADA'] || undefined,
                            workModality: row['MODALIDAD'] || undefined,
                            baseSalary: sueldo || undefined,
                            productiveStartDate: productiveStart || undefined,
                            productiveEndDate: productiveEnd || undefined,
                        },
                        assignment: {
                            company: row['EMPRESA'] || undefined,
                            project: row['PROYECTO'] || undefined,
                            analyticalAccount: row['CUENTA ANALITICA'] ? String(row['CUENTA ANALITICA']) : undefined,
                            location: [row['REGIONAL'], row['BASE DE OPERACION']].filter(Boolean).join(' - ') || undefined,
                            area: row['DEPARTAMENTO'] || undefined,
                            directSupervisor: row['JEFE INMEDIATO'] || undefined,
                            accountingProfile: row['PERFIL CONTABLE'] || undefined,
                            profile: row['PERFIL'] || undefined,
                            position: row['CARGO'] || undefined,
                            clientApplicationStatus: row['ESTADO APLICATIVO CLIENTE'] || undefined,
                        },
                    },

                    salaryInfo: {
                        salaryType: row['TIPO DE SALARIO'] || undefined,
                        baseSalary: sueldo || undefined,
                        transportAllowance: auxTransporte || undefined,
                        foodAllowance: auxAlimentacion || undefined,
                        vehicleAllowance: auxRodamiento || undefined,
                        toolsAllowance: auxHerramientas || undefined,
                        communicationAllowance: auxComunicacion || undefined,
                        salaryKpi: kpiSalarial || undefined,
                        discountRecord: row['Acta de Descuento'] || undefined,
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
                        entryJustification: row['JUSTIFICACIÓN DE INGRESO'] || row['JUSTIFICACION DE INGRESO'] || undefined,
                        terminationDate: fechaRetiro || undefined,
                        terminationReason: row['MOTIVO'] || undefined,
                        terminationJustification: row['JUSTIFICACIÓN RETIRO'] || row['JUSTIFICACION RETIRO'] || undefined,
                        folderCompliance: parseBool(row['CUMPLIMIENTO DE CARPETA 100%']),
                        disciplinaryActions: llamadosAtencion ?? undefined,
                        isMother: parseBool(row['MADRE']),
                        isPregnant: parseBool(row['EMBARAZO']),
                        lifeInsuranceStatus: row['ESTADO SEGURO DE VIDA'] || undefined,
                    },

                    professionalProfile: {
                        academicLevel: row['NIVEL ACADEMICA'] || row['NIVEL ACADEMICO'] || undefined,
                        degree: row['PROFESION'] || undefined,
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

                // Generar retiro si tiene fecha, o si es excolaborador (usar fallback de fecha)
                const fechaRetiroFinal = fechaRetiro || (isRetirado ? (productiveEnd || new Date()) : null);
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

            return {
                ...results,
                movements: movementResults,
            };
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
    };
};