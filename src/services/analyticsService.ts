import { collection, collectionGroup, getDocs, addDoc, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '../config/firestoreCollections';
import type { RotationMetrics, MonthlyData, FilterOptions, MovementRecord } from '../models/types/Analytics';
import type { Company } from '../models/types/Company';
import { MOTIVOS_RETIRO, esVoluntario } from '../domain/humanResources/terminationReasons';

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
// calcular rotación. Se aceptan las variantes históricas del tipo de contrato.
export const isSenaApprentice = (relation: any): boolean => {
  const contractType = normalize(
    relation?.contractType
      ?? relation?.contract?.contractType
      ?? relation?.contractInfo?.contract?.contractType
  );
  return contractType.includes('aprendizaje')
    || contractType.includes('aprendizsena')
    || contractType === 'aprendiz';
};

const matchesCompany = (relation: any, companyName: string, companies: Company[]) => {
  const target = companies.find(c => normalize(c.name) === normalize(companyName));
  if (target) {
    if (relation.companyId && relation.companyId === target.id) return true;
    const accepted = [target.name, ...(target.aliases ?? [])].map(normalize);
    return accepted.includes(normalize(relation.companyName));
  }
  return normalize(relation.companyName) === normalize(companyName);
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const MOTIVOS_ORDEN = MOTIVOS_RETIRO;

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
      const [companiesSnap, employmentSnap] = await Promise.all([
        getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
        getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
      ]);
      const companies = companiesSnap.docs.map(item => ({ id: item.id, ...item.data() } as Company));
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
      if (filters?.proyecto) relations = relations.filter(r => normalize(r.projectName) === normalize(filters.proyecto));

      // Regla de negocio: los aprendices SENA no aplican para rotación.
      relations = relations.filter(r => !isSenaApprentice(r));

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

      // Fotografía de relaciones vigentes al cierre del período. En meses pasados
      // incluye a quien seguía vinculado entonces aunque hoy ya esté retirado.
      const isActiveAt = (r: any, refDate: Date) => {
        if (r.status !== 'active' && r.status !== 'retired') return false;
        // Para la fotografía actual, el estado vigente es la fuente oficial. Esto
        // evita revivir retiros por fechas ambiguas y evita excluir ingresos activos
        // como 12/08/2026 interpretados erróneamente como 8 de diciembre.
        if (refDate >= today) return r.status === 'active';
        const start = toDate(r.startDate);
        if (!start || start > refDate) return false;
        if (r.status === 'retired') {
          const end = toDate(r.endDate);
          if (!end || end < refDate) return false;
        }
        return true;
      };
      const activeRelations = relations.filter(r => {
        return isActiveAt(r, periodEnd);
      });
      const headcount = new Set(activeRelations.map(r => r.employeeId)).size;

      // Headcount de UN mes puntual: al cierre de ese mes (capado a hoy si es el mes
      // en curso). Reconstruye el estado histórico porque el campo status es el
      // estado ACTUAL de la relación, no una foto por fecha: para saber quién seguía
      // vinculado al cierre de un mes pasado hay que incluir también a quien ya está
      // retirado hoy pero cuyo endDate era posterior a esa fecha — si no, cualquiera
      // que se haya ido después se borra también de la foto de meses atrás.
      const monthlyHeadcount = (year: number, month: number) => {
        const mEndRaw = new Date(year, month + 1, 0);
        const mEnd = mEndRaw < today ? mEndRaw : today;
        return new Set(
          relations.filter(r => isActiveAt(r, mEnd)).map(r => r.employeeId)
        ).size;
      };

      // Denominador de las tasas de rotación: headcount normal (sin promediar) al
      // cierre del período filtrado — ya calculado arriba como `headcount`.
      const headcountBaseLabel = filters?.mes !== undefined
        ? `Base: headcount de ${this.getMonthName(currentMonth)} ${currentYear}`
        : `Base: headcount al cierre de ${this.getMonthName(periodEnd.getMonth())} ${currentYear}`;

      // Un ingreso/retiro con fecha futura (ej. una terminación ya registrada con
      // preaviso) todavía no ocurrió — no debe sumar en el conteo del período hasta
      // que su fecha efectivamente llegue, o se infla la rotación con movimientos
      // que aún no pasan.
      const inPeriod = (date: Date | null) => date
        && date <= today
        && date.getFullYear() === currentYear
        && (filters?.mes === undefined || date.getMonth() === currentMonth);

      const ingresos = relations.filter(r => inPeriod(toDate(r.startDate)));
      const retiros = relations.filter(r => r.status === 'retired' && inPeriod(toDate(r.endDate)));

      let tiempoPromedioEmpresa = 0;
      let countWithContract = 0;
      activeRelations.forEach(r => {
        const start = toDate(r.startDate);
        if (!start) return;
        const months = this.monthsDifference(start, periodEnd);
        if (months >= 0) { tiempoPromedioEmpresa += months; countWithContract++; }
      });
      tiempoPromedioEmpresa = countWithContract > 0 ? Math.round((tiempoPromedioEmpresa / countWithContract) * 10) / 10 : 0;

      const retirosVoluntarios   = retiros.filter(r => esVoluntario(r.terminationReason)).length;
      const retirosInvoluntarios = retiros.length - retirosVoluntarios;

      // Fórmula oficial: renuncias voluntarias / HT del período, sin aprendices.
      const rotacionGeneral    = headcount > 0 ? round2((retirosVoluntarios / headcount) * 100) : 0;
      const rotacionVoluntaria = headcount > 0 ? round2((retirosVoluntarios / headcount) * 100) : 0;
      const rotacionEvitable   = rotacionVoluntaria;
      const tasaVoluntaria     = retiros.length > 0 ? round2((retirosVoluntarios / retiros.length) * 100) : 0;
      const cubrimiento        = retiros.length > 0 ? round2((ingresos.length / retiros.length) * 100) : 0;

      const monthlyData: MonthlyData[] = [];
      const showFullYear = filters?.mes === undefined;
      const monthCount = showFullYear ? 12 : 1;
      for (let i = monthCount - 1; i >= 0; i--) {
        const refMonth = showFullYear ? 11 : currentMonth;
        const date = new Date(currentYear, refMonth - i, 1);
        const month = date.getMonth();
        const year = date.getFullYear();
        // Igual que inPeriod: un movimiento con fecha futura aún no ocurrió.
        const sameMonth = (d: Date | null) => d && d <= today && d.getMonth() === month && d.getFullYear() === year;
        const monthIngresos = relations.filter(r => sameMonth(toDate(r.startDate))).length;
        const monthRetiros  = relations.filter(r => r.status === 'retired' && sameMonth(toDate(r.endDate))).length;
        const monthRetirosVoluntarios = relations.filter(r =>
          r.status === 'retired'
          && sameMonth(toDate(r.endDate))
          && esVoluntario(r.terminationReason)
        ).length;
        // Headcount de ESE mes, no el headcount global del período filtrado — si no,
        // enero se divide entre el headcount de diciembre.
        const monthHeadcount = monthlyHeadcount(year, month);
        const monthRotacion = monthHeadcount > 0 ? round2((monthRetirosVoluntarios / monthHeadcount) * 100) : 0;
        monthlyData.push({ month: this.getMonthName(month), year, ingresos: monthIngresos, retiros: monthRetiros, rotacion: monthRotacion, rotacionEvitable: monthRotacion });
      }

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
        const map = new Map<string, number>();
        retiros.forEach(retiro => {
          const empresa = retiro.companyName?.trim() || 'Sin empresa';
          map.set(empresa, (map.get(empresa) ?? 0) + 1);
        });
        return [...map.entries()]
          .map(([empresa, count]) => ({ empresa, count }))
          .sort((a, b) => b.count - a.count || a.empresa.localeCompare(b.empresa, 'es'));
      })();

      return {
        totalIngresos: ingresos.length,
        totalRetiros: retiros.length,
        headcount,
        tiempoPromedioEmpresa,
        rotacionGeneral,
        rotacionVoluntaria,
        rotacionEvitable,
        headcountBaseLabel,
        headcountBase: headcount,
        tasaVoluntaria,
        tasaVoluntariaExterna: tasaVoluntaria,
        cubrimiento,
        voluntarioVsInvoluntario: { voluntario: retirosVoluntarios, involuntario: retirosInvoluntarios },
        externoVsInterno: { externo: retirosVoluntarios, interno: retirosInvoluntarios },
        motivosRetiro,
        retirosPorEmpresa,
        headcountPorProyecto: (() => {
          const map = new Map<string, { empresa: string; count: number }>();
          activeRelations.forEach(r => {
            const proj = r.projectName || 'Sin cuenta analítica';
            const emp  = r.companyName || '';
            if (!map.has(proj)) map.set(proj, { empresa: emp, count: 0 });
            map.get(proj)!.count++;
          });
          return [...map.entries()]
            .map(([proyecto, d]) => ({ proyecto, empresa: d.empresa, count: d.count }))
            .sort((a, b) => b.count - a.count);
        })(),
        ingresosPorMes: monthlyData,
        retirosPorMes: monthlyData,
        costoRetiros,
        fracasoContratacion: headcount > 0 ? round2((retirosTempranos / headcount) * 100) : 0,
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
        const projectName = data.projectName;
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
