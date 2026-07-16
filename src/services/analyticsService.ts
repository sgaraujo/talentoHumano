import { collection, collectionGroup, getDocs, addDoc, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '../config/firestoreCollections';
import type { RotationMetrics, MonthlyData, FilterOptions, MovementRecord } from '../models/types/Analytics';
import type { Company } from '../models/types/Company';

const toDate = (raw: any): Date | null => {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw.toDate === 'function') return raw.toDate();
  if (typeof raw.seconds === 'number') return new Date(raw.seconds * 1000);
  if (typeof raw === 'string' && raw.trim()) return new Date(raw);
  return null;
};

const normalize = (value?: string) => String(value ?? '').toLowerCase().normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '');

const matchesCompany = (relation: any, companyName: string, companies: Company[]) => {
  const target = companies.find(c => normalize(c.name) === normalize(companyName));
  if (target) {
    if (relation.companyId && relation.companyId === target.id) return true;
    const accepted = [target.name, ...(target.aliases ?? [])].map(normalize);
    return accepted.includes(normalize(relation.companyName));
  }
  return normalize(relation.companyName) === normalize(companyName);
};

const esVoluntario = (reason?: string) => {
  const l = (reason || '').toLowerCase();
  return l.includes('renuncia') || l.includes('mutuo acuerdo') || l === 'voluntario';
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const MOTIVOS_ORDEN = [
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

  // Calcular métricas de rotación — fuente: human_resources/data/employees + employments
  async getRotationMetrics(filters?: FilterOptions): Promise<RotationMetrics> {
    try {
      const [companiesSnap, employmentSnap] = await Promise.all([
        getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
        getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
      ]);
      const companies = companiesSnap.docs.map(item => ({ id: item.id, ...item.data() } as Company));
      let relations = employmentSnap.docs.map(item => ({
        id: item.id, employeeId: item.data().employeeId || item.ref.parent.parent?.id, ...item.data(),
      } as any));

      if (filters?.empresa) relations = relations.filter(r => matchesCompany(r, filters.empresa!, companies));
      if (filters?.proyecto) relations = relations.filter(r => normalize(r.projectName) === normalize(filters.proyecto));

      const today = new Date();
      const currentYear = filters?.año || today.getFullYear();
      const currentMonth = filters?.mes !== undefined ? filters.mes : today.getMonth();

      const activeRelations = relations.filter(r => r.status === 'active');
      const headcount = new Set(activeRelations.map(r => r.employeeId)).size;

      const inPeriod = (date: Date | null) => date
        && date.getFullYear() === currentYear
        && (filters?.mes === undefined || date.getMonth() === currentMonth);

      const ingresos = relations.filter(r => inPeriod(toDate(r.startDate)));
      const retiros = relations.filter(r => r.status === 'retired' && inPeriod(toDate(r.endDate)));

      let tiempoPromedioEmpresa = 0;
      let countWithContract = 0;
      activeRelations.forEach(r => {
        const start = toDate(r.startDate);
        if (!start) return;
        const months = this.monthsDifference(start, today);
        if (months >= 0) { tiempoPromedioEmpresa += months; countWithContract++; }
      });
      tiempoPromedioEmpresa = countWithContract > 0 ? Math.round((tiempoPromedioEmpresa / countWithContract) * 10) / 10 : 0;

      const retirosVoluntarios   = retiros.filter(r => esVoluntario(r.terminationReason)).length;
      const retirosInvoluntarios = retiros.length - retirosVoluntarios;

      const rotacionGeneral    = headcount > 0 ? round2((retiros.length / headcount) * 100) : 0;
      const rotacionVoluntaria = headcount > 0 ? round2((retirosVoluntarios / headcount) * 100) : 0;
      const rotacionEvitable   = rotacionVoluntaria;
      const tasaVoluntaria     = retiros.length > 0 ? round2((retirosVoluntarios / retiros.length) * 100) : 0;
      const cubrimiento        = retiros.length > 0 ? round2((ingresos.length / retiros.length) * 100) : 0;

      const monthlyData: MonthlyData[] = [];
      const showFullYear = filters?.mes === undefined;
      for (let i = 11; i >= 0; i--) {
        const refMonth = showFullYear ? 11 : currentMonth;
        const date = new Date(currentYear, refMonth - i, 1);
        const month = date.getMonth();
        const year = date.getFullYear();
        const sameMonth = (d: Date | null) => d && d.getMonth() === month && d.getFullYear() === year;
        const monthIngresos = relations.filter(r => sameMonth(toDate(r.startDate))).length;
        const monthRetiros  = relations.filter(r => r.status === 'retired' && sameMonth(toDate(r.endDate))).length;
        const monthRotacion = headcount > 0 ? round2((monthRetiros / headcount) * 100) : 0;
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

      return {
        totalIngresos: ingresos.length,
        totalRetiros: retiros.length,
        headcount,
        tiempoPromedioEmpresa,
        rotacionGeneral,
        rotacionVoluntaria,
        rotacionEvitable,
        tasaVoluntaria,
        tasaVoluntariaExterna: tasaVoluntaria,
        cubrimiento,
        voluntarioVsInvoluntario: { voluntario: retirosVoluntarios, involuntario: retirosInvoluntarios },
        externoVsInterno: { externo: retirosVoluntarios, interno: retirosInvoluntarios },
        motivosRetiro,
        headcountPorProyecto: (() => {
          const map = new Map<string, { empresa: string; count: number }>();
          activeRelations.forEach(r => {
            const proj = r.projectName || 'Sin proyecto';
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

  // Opciones de filtro — empresas desde el catálogo maestro, proyectos desde las relaciones laborales
  async getFilterOptions(): Promise<{ empresas: string[]; proyectos: string[] }> {
    try {
      const [companiesSnap, employmentSnap] = await Promise.all([
        getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
        getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
      ]);
      const empresas = companiesSnap.docs.map(item => (item.data() as any).name).filter(Boolean).sort();
      const proyectosSet = new Set<string>();
      employmentSnap.docs.forEach(item => {
        const projectName = (item.data() as any).projectName;
        if (projectName) proyectosSet.add(projectName);
      });
      return { empresas, proyectos: [...proyectosSet].sort() };
    } catch (error) {
      console.error('Error obteniendo opciones de filtro:', error);
      return { empresas: [], proyectos: [] };
    }
  }
}

export const analyticsService = new AnalyticsService();
