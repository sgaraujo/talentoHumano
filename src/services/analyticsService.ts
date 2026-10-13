import { collection, collectionGroup, getDocs, addDoc, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '../config/firestoreCollections';
import type { RotationMetrics, MonthlyData, FilterOptions, MovementRecord, RetiredPerson, NewHirePerson } from '../models/types/Analytics';
import type { Company } from '../models/types/Company';
import { MOTIVOS_RETIRO, SIN_CLASIFICAR, esVoluntario } from '../domain/humanResources/terminationReasons';

// Fecha local como YYYY-MM-DD (vacío si no hay fecha).
const isoDate = (date: Date | null) => date
  ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  : '';

export const toDate = (raw: any): Date | null => {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw.toDate === 'function') {
    const d = raw.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw.seconds === 'number') return new Date(raw.seconds * 1000);
  if (typeof raw._seconds === 'number') return new Date(raw._seconds * 1000);
  if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    const timestampMatch = s.match(/Timestamp\s*\(\s*seconds\s*=\s*(-?\d+)/i);
    if (timestampMatch) return new Date(Number(timestampMatch[1]) * 1000);
    // Fechas de employments quedaron guardadas con formatos mixtos: mayoritariamente
    // M/D/YYYY (herencia de toLocaleDateString en-US) y algunas D/M/YYYY (texto de Excel
    // sin convertir). new Date() nativo solo entiende M/D/Y y produce fechas inválidas o
    // erróneas (sin lanzar error) para el resto — hay que desambiguar a mano.
    const parts = s.split(/[\/\-]/);
    if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) {
      const [a, b, c] = parts.map(Number);
      if (a > 31) {
        const d = new Date(a, b - 1, c);
        if (!isNaN(d.getTime()) && d.getFullYear() === a && d.getMonth() === b - 1 && d.getDate() === c) return d;
      } else {
        const year = c < 100 ? (c < 50 ? 2000 + c : 1900 + c) : c;
        if (a > 12 && b <= 12) {
          // "a" no puede ser mes: forzar día/mes/año
          const dmy = new Date(year, b - 1, a);
          if (!isNaN(dmy.getTime()) && dmy.getMonth() === b - 1 && dmy.getDate() === a) return dmy;
        } else if (b > 12 && a <= 12) {
          // "b" no puede ser mes: forzar mes/día/año
          const mdy = new Date(year, a - 1, b);
          if (!isNaN(mdy.getTime()) && mdy.getMonth() === a - 1 && mdy.getDate() === b) return mdy;
        } else if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
          // Ambos válidos como mes: para esta colección predomina mes/día/año (~80% de los casos no ambiguos)
          const mdy = new Date(year, a - 1, b);
          if (!isNaN(mdy.getTime()) && mdy.getMonth() === a - 1 && mdy.getDate() === b) return mdy;
        }
      }
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const normalize = (value?: string) => String(value ?? '').toLowerCase().normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '');

// Los aprendices SENA no hacen parte de la base ni de los retiros usados para
// calcular rotación, ni del headcount de ninguna empresa/cuenta analítica. Se
// aceptan las variantes históricas del tipo de contrato, pero en muchos
// registros antiguos ese campo quedó vacío — en esos casos la cuenta
// analítica "SENA" es la única señal confiable de que la persona es aprendiz.
/**
 * Aprendiz para informarlo aparte en rotación: además de la regla anterior,
 * reconoce el contrato "laboral especial" (aprendiz SENA desde la reforma
 * laboral) y la cuenta analítica APRENDICES.
 */
// Acepta tanto relaciones laborales (analyticalAccount/projectName) como las
// asignaciones del directorio de empleados, donde la cuenta llega en `project`.
export const isApprenticeRelation = (relation: Parameters<typeof isSenaApprentice>[0]): boolean => isSenaApprentice(relation)
  || normalize(relation?.contractType).includes('laboralespecial')
  || [relation?.analyticalAccount, relation?.projectName, relation?.project]
    .some(account => normalize(account) === 'aprendices');

export const isSenaApprentice = (relation: any): boolean => {
  const contractType = normalize(
    relation?.contractType
      ?? relation?.contract?.contractType
      ?? relation?.contractInfo?.contract?.contractType
  );
  if (contractType.includes('aprendizaje')
    || contractType.includes('aprendizsena')
    || contractType === 'aprendiz') return true;

  const projectName = normalize(
    relation?.projectName
      ?? relation?.project
      ?? relation?.contractInfo?.assignment?.project
  );
  return projectName.includes('sena');
};

// Cuenta analítica de una relación laboral. `projectName` (columna PROYECTO,
// vinculada al catálogo maestro) llega vacío en las importaciones actuales;
// la cuenta real está en `analyticalAccount` (columna CUENTA ANALITICA).
export const analyticalAccountOf = (relation: any): string =>
  String(relation?.projectName || relation?.analyticalAccount || '').trim();

// Compara por companyId o por nombre/alias normalizado (sin tildes, puntos ni
// espacios): "INTEEGRA S.A.S BIC" del Excel = "INTEEGRA SAS BIC" del catálogo.
export const matchesCompany = (relation: any, companyName: string, companies: Company[]) => {
  const target = companies.find(c => normalize(c.name) === normalize(companyName));
  if (target) {
    if (relation.companyId && relation.companyId === target.id) return true;
    const accepted = [target.name, ...(target.aliases ?? [])].map(normalize);
    return accepted.includes(normalize(relation.companyName));
  }
  return normalize(relation.companyName) === normalize(companyName);
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const MOTIVOS_ORDEN = [...MOTIVOS_RETIRO, SIN_CLASIFICAR];

class AnalyticsService {
  private movementsCollection = FIRESTORE_COLLECTIONS.movements;

  // Calcular meses de diferencia entre dos fechas
  private monthsDifference(date1: Date, date2: Date): number {
    const months = (date2.getFullYear() - date1.getFullYear()) * 12;
    return months + date2.getMonth() - date1.getMonth();
  }

  // Obtener nombre del mes
  private getMonthName(monthIndex: number): string {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months[monthIndex];
  }

  // Registrar movimiento (ingreso o retiro)
  // Registrar movimiento (ingreso o retiro)
  async registerMovement(movement: Omit<MovementRecord, 'id' | 'createdAt'>): Promise<string> {
    try {
      // Crear objeto limpio sin valores undefined
      const cleanMovement: any = {
        type: movement.type,
        userId: movement.userId,
        userName: movement.userName,
        userEmail: movement.userEmail,
        date: movement.date,
        createdBy: movement.createdBy,
        createdAt: new Date(),
      };

      // Solo agregar campos opcionales si tienen valor
      if (movement.reason) cleanMovement.reason = movement.reason;
      if (movement.company) cleanMovement.company = movement.company;
      if (movement.project) cleanMovement.project = movement.project;
      if (movement.sede) cleanMovement.sede = movement.sede;
      if (movement.area) cleanMovement.area = movement.area;
      if (movement.cost !== undefined && movement.cost !== null) cleanMovement.cost = movement.cost;
      if (movement.notes) cleanMovement.notes = movement.notes;

      const docRef = await addDoc(collection(db, this.movementsCollection), cleanMovement);

      console.log('✅ Movimiento registrado:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('Error registrando movimiento:', error);
      throw error;
    }
  }

  // Eliminar movements creados por una fuente específica (ej: 'import-excel')
  async deleteMovementsBySource(createdBy: string): Promise<number> {
    try {
      const q = query(collection(db, this.movementsCollection), where('createdBy', '==', createdBy));
      const snapshot = await getDocs(q);
      let deleted = 0;

      for (let i = 0; i < snapshot.docs.length; i += 450) {
        const batch = writeBatch(db);
        const chunk = snapshot.docs.slice(i, i + 450);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deleted += chunk.length;
      }
      console.log(`🗑️ ${deleted} movements eliminados (source: ${createdBy})`);
      return deleted;
    } catch (error) {
      console.error('Error eliminando movements:', error);
      throw error;
    }
  }

  // Registrar múltiples movimientos en batch
  async registerMovementsBatch(movements: Omit<MovementRecord, 'id' | 'createdAt'>[]): Promise<{ ingresos: number; retiros: number }> {
    let ingresos = 0;
    let retiros = 0;

    let batch = writeBatch(db);
    let operationCount = 0;

    const commitIfFull = async () => {
      if (operationCount < 450) return;
      await batch.commit();
      batch = writeBatch(db);
      operationCount = 0;
    };

    for (const movement of movements) {
      try {
        const cleanMovement: any = {
          type: movement.type,
          userId: movement.userId,
          userName: movement.userName,
          userEmail: movement.userEmail,
          date: movement.date,
          createdBy: movement.createdBy,
          createdAt: new Date(),
        };

        if (movement.reason) cleanMovement.reason = movement.reason;
        if (movement.company) cleanMovement.company = movement.company;
        if (movement.project) cleanMovement.project = movement.project;
        if (movement.sede) cleanMovement.sede = movement.sede;
        if (movement.area) cleanMovement.area = movement.area;
        if (movement.cost !== undefined && movement.cost !== null) cleanMovement.cost = movement.cost;
        if (movement.notes) cleanMovement.notes = movement.notes;

        const ref = doc(collection(db, this.movementsCollection));
        batch.set(ref, cleanMovement);
        operationCount++;

        if (movement.type === 'ingreso') ingresos++;
        if (movement.type === 'retiro') retiros++;
        await commitIfFull();
      } catch (error) {
        console.error('Error registrando movimiento en batch:', error);
      }
    }

    if (operationCount > 0) await batch.commit();

    console.log(`✅ Movements batch: ${ingresos} ingresos, ${retiros} retiros`);
    return { ingresos, retiros };
  }

  // Obtener movimientos
  async getMovements(): Promise<MovementRecord[]> {
    try {
      const movementsSnapshot = await getDocs(collection(db, this.movementsCollection));

      return movementsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate?.() || new Date(doc.data().date),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt),
      })) as MovementRecord[];
    } catch (error) {
      console.error('Error obteniendo movimientos:', error);
      return [];
    }
  }

  // Obtener el histórico completo de employments (contratos) de todos los empleados
  async getEmploymentRecords(): Promise<any[]> {
    try {
      const snapshot = await getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments));
      return snapshot.docs.map(item => {
        const data = item.data();
        return {
          id: item.id,
          ...data,
          employeeId: data.employeeId || item.ref.parent.parent?.id,
        };
      });
    } catch (error) {
      console.error('Error obteniendo employments:', error);
      return [];
    }
  }

  // Calcular métricas de rotación — fuente: human_resources/data/employees + employments
  async getRotationMetrics(filters?: FilterOptions): Promise<RotationMetrics> {
    try {
      const [companiesSnap, employmentSnap, employeesSnap] = await Promise.all([
        getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
        getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
        getDocs(collection(db, FIRESTORE_COLLECTIONS.employees)),
      ]);
      const companies = companiesSnap.docs.map(item => ({ id: item.id, ...item.data() } as Company));
      const employees = new Map(employeesSnap.docs.map(item => [item.id, item.data() as any]));
      let relations = employmentSnap.docs.map(item => {
        const data = item.data();
        return { id: item.id, ...data, employeeId: data.employeeId || item.ref.parent.parent?.id } as any;
      });

      // Esta analítica es de Talento Humano: solo cuentan las relaciones de empresas
      // con el módulo TH activo, igual que "Colaboradores activos" en Resumen.
      const thCompanies = companies.filter(c => c.activeTH);
      relations = relations.filter(r => thCompanies.some(c => {
        if (r.companyId && r.companyId === c.id) return true;
        const accepted = [c.name, ...(c.aliases ?? [])].map(normalize);
        return accepted.includes(normalize(r.companyName));
      }));

      if (filters?.empresa) relations = relations.filter(r => matchesCompany(r, filters.empresa!, companies));
      if (filters?.proyecto) relations = relations.filter(r => normalize(analyticalAccountOf(r)) === normalize(filters.proyecto));

      // Reglas de la tabla oficial de Talento Humano ("Retiros y rotación mensual"):
      //  • Headcount = contratos vigentes (filas del Excel), no personas.
      //  • Un retiro descuenta el mismo día: quien se retira el 30/06 ya no cuenta
      //    en el cierre de junio.
      //  • HC inicial del mes = HC final del mes anterior; HC promedio = (inicial + final) / 2.
      //  • Rotación % = retiros / HC promedio; voluntaria e involuntaria por separado
      //    y la sustitución patronal aparte (no es voluntaria ni involuntaria).
      // Los aprendices SENA no se suman con los trabajadores: quedan fuera del
      // headcount, ingresos, retiros y tasas, y se informan aparte en `aprendices`.
      const apprentices = relations.filter(isApprenticeRelation);
      relations = relations.filter(r => !isApprenticeRelation(r));

      const today = new Date();
      const currentYear = filters?.año || today.getFullYear();
      const currentMonth = filters?.mes !== undefined ? filters.mes : today.getMonth();

      // Fin del período filtrado (último día del mes, o del año si no hay mes elegido),
      // topado a hoy para que el mes/año en curso siga reflejando el headcount actual.
      const periodEnd = (() => {
        const end = filters?.mes !== undefined
          ? new Date(currentYear, currentMonth + 1, 0)
          : new Date(currentYear, 11, 31);
        return end < today ? end : today;
      })();

      // Contrato vigente al cierre de `refDate`. Para la foto actual manda el
      // estado vigente; para cierres pasados se reconstruye con las fechas.
      type RelationRecord = (typeof relations)[number];
      const isActiveAt = (r: RelationRecord, refDate: Date) => {
        if (r.status !== 'active' && r.status !== 'retired') return false;
        if (refDate >= today) return r.status === 'active';
        const start = toDate(r.startDate);
        if (!start || start > refDate) return false;
        if (r.status === 'retired') {
          const end = toDate(r.endDate);
          // El día del retiro ya no cuenta como vigente (regla de TH).
          if (!end || end <= refDate) return false;
        }
        return true;
      };
      const headcountAt = (list: RelationRecord[], refDate: Date) => list.filter(r => isActiveAt(r, refDate)).length;
      const monthEnd = (year: number, month: number) => {
        const end = new Date(year, month + 1, 0);
        return end < today ? end : today;
      };

      const isVoluntary = (r: RelationRecord) => esVoluntario(r.terminationReason);
      const isSubstitution = (r: RelationRecord) => normalize(r.terminationReason).includes('sustitucionpatronal');
      // Un movimiento con fecha futura (ej. retiro con preaviso) todavía no ocurrió.
      const happenedIn = (date: Date | null, year: number, month?: number) => !!date
        && date <= today && date.getFullYear() === year && (month === undefined || date.getMonth() === month);

      const monthStats = (year: number, month: number) => {
        const hcInicial = headcountAt(relations, new Date(year, month, 0));
        const hcFinal = headcountAt(relations, monthEnd(year, month));
        const hcPromedio = round2((hcInicial + hcFinal) / 2);
        const ingresos = relations.filter(r => happenedIn(toDate(r.startDate), year, month)).length;
        const monthRetiros = relations.filter(r => r.status === 'retired' && happenedIn(toDate(r.endDate), year, month));
        const voluntarios = monthRetiros.filter(isVoluntary).length;
        const sustitucion = monthRetiros.filter(isSubstitution).length;
        const involuntarios = monthRetiros.length - voluntarios - sustitucion;
        const rate = (value: number) => hcPromedio > 0 ? round2((value / hcPromedio) * 100) : 0;
        return {
          month: this.getMonthName(month), year, ingresos, retiros: monthRetiros.length,
          hcInicial, hcFinal, hcPromedio,
          retirosVoluntarios: voluntarios, retirosInvoluntarios: involuntarios, sustitucionPatronal: sustitucion,
          rotacion: rate(monthRetiros.length), rotacionEvitable: rate(voluntarios),
          rotacionVoluntaria: rate(voluntarios), rotacionInvoluntaria: rate(involuntarios),
        };
      };

      const activeRelations = relations.filter(r => isActiveAt(r, periodEnd));
      const headcount = activeRelations.length;

      // Meses del período: el mes elegido, o de enero al mes de cierre del año.
      const includedMonths = filters?.mes !== undefined
        ? [currentMonth]
        : Array.from({ length: periodEnd.getFullYear() === currentYear ? periodEnd.getMonth() + 1 : 12 }, (_, m) => m);
      const periodMonths = includedMonths.map(m => monthStats(currentYear, m));
      // Base de las tasas = HC promedio del mes; para varios meses, el promedio
      // de los HC promedio mensuales (igual que la fila "Acumulado" de TH).
      const rotationHeadcount = periodMonths.length
        ? round2(periodMonths.reduce((sum, m) => sum + m.hcPromedio, 0) / periodMonths.length)
        : 0;
      const firstMonth = periodMonths[0];
      const headcountBaseLabel = filters?.mes !== undefined
        ? `Base: HC promedio de ${this.getMonthName(currentMonth)} ${currentYear} = (${firstMonth?.hcInicial ?? 0} + ${firstMonth?.hcFinal ?? 0}) / 2`
        : `Base: HC promedio ${this.getMonthName(includedMonths[0]).slice(0, 3)}–${this.getMonthName(includedMonths[includedMonths.length - 1]).slice(0, 3)} ${currentYear}`;

      const ingresos = relations.filter(r => happenedIn(toDate(r.startDate), currentYear, filters?.mes));
      const retiros = relations.filter(r => r.status === 'retired' && happenedIn(toDate(r.endDate), currentYear, filters?.mes));

      let tiempoPromedioEmpresa = 0;
      let countWithContract = 0;
      activeRelations.forEach(r => {
        const start = toDate(r.startDate);
        if (!start) return;
        const months = this.monthsDifference(start, periodEnd);
        if (months >= 0) { tiempoPromedioEmpresa += months; countWithContract++; }
      });
      tiempoPromedioEmpresa = countWithContract > 0 ? Math.round((tiempoPromedioEmpresa / countWithContract) * 10) / 10 : 0;

      const retirosVoluntarios   = retiros.filter(isVoluntary).length;
      const sustitucionPatronal  = retiros.filter(isSubstitution).length;
      const retirosInvoluntarios = retiros.length - retirosVoluntarios - sustitucionPatronal;

      const rate = (value: number) => rotationHeadcount > 0 ? round2((value / rotationHeadcount) * 100) : 0;
      const rotacionGeneral      = rate(retiros.length);
      const rotacionVoluntaria   = rate(retirosVoluntarios);
      const rotacionInvoluntaria = rate(retirosInvoluntarios);
      const rotacionEvitable     = rotacionVoluntaria;
      const cubrimiento          = retiros.length > 0 ? round2((ingresos.length / retiros.length) * 100) : 0;

      // Gráfico: los 12 meses del año, o solo el mes elegido.
      const monthlyData: MonthlyData[] = filters?.mes === undefined
        ? Array.from({ length: 12 }, (_, m) => monthStats(currentYear, m))
        : [monthStats(currentYear, currentMonth)];

      const aprendices = {
        headcount: headcountAt(apprentices, periodEnd),
        ingresos: apprentices.filter(r => happenedIn(toDate(r.startDate), currentYear, filters?.mes)).length,
        retiros: apprentices.filter(r => r.status === 'retired' && happenedIn(toDate(r.endDate), currentYear, filters?.mes)).length,
      };
      const costoRetiros = retiros.reduce((sum, r) => sum + (Number(r.terminationCost) || 0), 0);
      const isTemprano = (r: any) => {
        const start = toDate(r.startDate);
        const end = toDate(r.endDate);
        return !!start && !!end && this.monthsDifference(start, end) < 3;
      };
      const retirosTempranosList = retiros.filter(isTemprano);
      const retirosTempranos = retirosTempranosList.length;
      const costoRetirosTemprano = retirosTempranosList.reduce((sum, r) => sum + (Number(r.terminationCost) || 0), 0);

      const motivosRetiro: Record<string, number> = {};
      for (const m of MOTIVOS_ORDEN) motivosRetiro[m] = 0;
      retiros.forEach(r => {
        const key = r.terminationReason && motivosRetiro.hasOwnProperty(r.terminationReason) ? r.terminationReason : 'Sin motivo';
        motivosRetiro[key] = (motivosRetiro[key] || 0) + 1;
      });
      const retirosPorEmpresa = (() => {
        const map = new Map<string, RetiredPerson[]>();
        retiros.forEach(retiro => {
          const empresa = retiro.companyName?.trim() || 'Sin empresa';
          const employee = employees.get(retiro.employeeId) ?? {};
          const person: RetiredPerson = {
            employeeId: retiro.employeeId,
            nombre: employee.fullName || 'Sin nombre',
            documento: employee.documentNumber || retiro.employeeId || '',
            motivo: retiro.terminationReason && motivosRetiro.hasOwnProperty(retiro.terminationReason) ? retiro.terminationReason : 'Sin motivo',
            fechaRetiro: isoDate(toDate(retiro.endDate)),
            cargo: retiro.position,
          };
          map.set(empresa, [...(map.get(empresa) ?? []), person]);
        });
        return [...map.entries()]
          .map(([empresa, personas]) => ({
            empresa,
            count: personas.length,
            personas: personas.sort((a, b) => b.fechaRetiro.localeCompare(a.fechaRetiro) || a.nombre.localeCompare(b.nombre, 'es')),
          }))
          .sort((a, b) => b.count - a.count || a.empresa.localeCompare(b.empresa, 'es'));
      })();

      return {
        totalIngresos: ingresos.length,
        totalRetiros: retiros.length,
        // Con un mes específico esto es el headcount puntual de ese mes (igual a
        // `headcount`); con "todos los meses" es el promedio de los headcounts
        // mensuales del rango — mostrar el headcount puntual del cierre ahí
        // subestima/sobreestima el tamaño real del equipo durante el año.
        // "Vigentes al cierre" del período (contratos), como el HC final de TH.
        headcount,
        headcountSnapshot: headcount,
        tiempoPromedioEmpresa,
        rotacionGeneral,
        rotacionVoluntaria,
        rotacionInvoluntaria,
        rotacionEvitable,
        headcountBaseLabel,
        headcountBase: rotationHeadcount,
        cubrimiento,
        voluntarioVsInvoluntario: { voluntario: retirosVoluntarios, involuntario: retirosInvoluntarios },
        sustitucionPatronal,
        hcPromedio: rotationHeadcount,
        detalleMensual: periodMonths,
        aprendices,
        externoVsInterno: { externo: retirosVoluntarios, interno: retirosInvoluntarios },
        motivosRetiro,
        retirosPorEmpresa,
        headcountPorProyecto: (() => {
          // `count` = vigentes al cierre; `ingresos` = nuevos ingresos del período
          // filtrado (incluye cuentas cuyo ingreso ya se retiró y no tienen vigentes).
          const map = new Map<string, { empresa: string; count: number; personasIngreso: NewHirePerson[] }>();
          const entryOf = (r: RelationRecord) => {
            const proj = analyticalAccountOf(r) || 'Sin cuenta analítica';
            if (!map.has(proj)) map.set(proj, { empresa: r.companyName || '', count: 0, personasIngreso: [] });
            return map.get(proj)!;
          };
          activeRelations.forEach(r => { entryOf(r).count++; });
          ingresos.forEach(r => {
            const employee = employees.get(r.employeeId) ?? {};
            entryOf(r).personasIngreso.push({
              employeeId: r.employeeId,
              nombre: employee.fullName || 'Sin nombre',
              documento: employee.documentNumber || r.employeeId || '',
              empresa: r.companyName?.trim() || 'Sin empresa',
              fechaIngreso: isoDate(toDate(r.startDate)),
              cargo: r.position,
              retirado: r.status === 'retired',
            });
          });
          return [...map.entries()]
            .map(([proyecto, d]) => ({
              proyecto, empresa: d.empresa, count: d.count, ingresos: d.personasIngreso.length,
              personasIngreso: d.personasIngreso.sort((a, b) => b.fechaIngreso.localeCompare(a.fechaIngreso) || a.nombre.localeCompare(b.nombre, 'es')),
            }))
            .sort((a, b) => b.count - a.count || b.ingresos - a.ingresos);
        })(),
        ingresosPorMes: monthlyData,
        retirosPorMes: monthlyData,
        costoRetiros,
        fracasoContratacion: rotationHeadcount > 0 ? round2((retirosTempranos / rotationHeadcount) * 100) : 0,
        costoRetirosTemprano,
        retirosTempranos,
      };
    } catch (error) {
      console.error('Error calculando métricas:', error);
      throw error;
    }
  }

  // Opciones de filtro — empresas desde el catálogo maestro, proyectos desde las relaciones laborales.
  // proyectosPorEmpresa permite que el selector de Proyecto se filtre en el momento
  // en que se elige una Empresa, sin esperar a aplicar los filtros.
  async getFilterOptions(): Promise<{ empresas: string[]; proyectos: string[]; proyectosPorEmpresa: Record<string, string[]> }> {
    try {
      const [companiesSnap, employmentSnap] = await Promise.all([
        getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
        getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
      ]);
      const allCompanies = companiesSnap.docs.map(item => item.data() as any);
      const thCompanies = allCompanies.filter(c => c.activeTH);
      const empresas = thCompanies.map(c => c.name).filter(Boolean).sort();

      const proyectosSet = new Set<string>();
      const proyectosPorEmpresaSet = new Map<string, Set<string>>();
      employmentSnap.docs.forEach(item => {
        const data = item.data() as any;
        const projectName = analyticalAccountOf(data);
        if (!projectName) return;
        const company = thCompanies.find(c => {
          if (data.companyId && data.companyId === c.id) return true;
          const accepted = [c.name, ...(c.aliases ?? [])].map(normalize);
          return accepted.includes(normalize(data.companyName));
        });
        if (!company) return;
        proyectosSet.add(projectName);
        if (!proyectosPorEmpresaSet.has(company.name)) proyectosPorEmpresaSet.set(company.name, new Set());
        proyectosPorEmpresaSet.get(company.name)!.add(projectName);
      });
      const proyectosPorEmpresa: Record<string, string[]> = {};
      for (const [empresa, set] of proyectosPorEmpresaSet) proyectosPorEmpresa[empresa] = [...set].sort();
      return { empresas, proyectos: [...proyectosSet].sort(), proyectosPorEmpresa };
    } catch (error) {
      console.error('Error obteniendo opciones de filtro:', error);
      return { empresas: [], proyectos: [], proyectosPorEmpresa: {} };
    }
  }
}

export const analyticsService = new AnalyticsService();
