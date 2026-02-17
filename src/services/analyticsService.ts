import { collection, getDocs, addDoc, query, where, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { RotationMetrics, MonthlyData, FilterOptions, MovementRecord } from '../models/types/Analytics';

class AnalyticsService {
  private movementsCollection = 'movements';

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
      for (const d of snapshot.docs) {
        await deleteDoc(doc(db, this.movementsCollection, d.id));
        deleted++;
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
        if (movement.sede) cleanMovement.sede = movement.sede;
        if (movement.area) cleanMovement.area = movement.area;
        if (movement.cost !== undefined && movement.cost !== null) cleanMovement.cost = movement.cost;
        if (movement.notes) cleanMovement.notes = movement.notes;

        await addDoc(collection(db, this.movementsCollection), cleanMovement);

        if (movement.type === 'ingreso') ingresos++;
        if (movement.type === 'retiro') retiros++;
      } catch (error) {
        console.error('Error registrando movimiento en batch:', error);
      }
    }

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

  // Calcular métricas de rotación
  async getRotationMetrics(filters?: FilterOptions): Promise<RotationMetrics> {
    try {
      // Obtener todos los usuarios
      const { userService } = await import('./userService');
      const allUsers = await userService.getAll();

      // Obtener movimientos
      const movements = await this.getMovements();

      const today = new Date();
      const currentYear = filters?.año || today.getFullYear();
      const currentMonth = filters?.mes !== undefined ? filters.mes : today.getMonth();

      // Filtrar colaboradores actuales
      const colaboradores = allUsers.filter(u => u.role === 'colaborador');

      // Calcular ingresos y retiros del periodo
      const ingresos = movements.filter(m => {
        const moveDate = new Date(m.date);
        return m.type === 'ingreso' &&
          moveDate.getFullYear() === currentYear &&
          (filters?.mes === undefined || moveDate.getMonth() === currentMonth);
      });

      const retiros = movements.filter(m => {
        const moveDate = new Date(m.date);
        return m.type === 'retiro' &&
          moveDate.getFullYear() === currentYear &&
          (filters?.mes === undefined || moveDate.getMonth() === currentMonth);
      });

      // Calcular headcount
      const headcount = colaboradores.length;

      // Calcular tiempo promedio en la empresa
      // Calcular tiempo promedio en la empresa
      let tiempoPromedioEmpresa = 0;
      let countWithContract = 0;

      colaboradores.forEach(user => {
        let startDate: Date | null = null;

        // Intentar obtener la fecha de inicio del contrato
        if (user.contractInfo?.contract?.startDate) {
          const contractStart = user.contractInfo.contract.startDate as any;

          if (contractStart instanceof Date) {
            startDate = contractStart;
          } else if (contractStart.toDate && typeof contractStart.toDate === 'function') {
            startDate = contractStart.toDate();
          } else if (typeof contractStart === 'string') {
            startDate = new Date(contractStart);
          }
        }

        // Si no hay fecha de contrato, usar createdAt como alternativa
        if (!startDate && user.createdAt) {
          if (user.createdAt instanceof Date) {
            startDate = user.createdAt;
          } else if (typeof user.createdAt === 'object' && user.createdAt !== null && 'toDate' in user.createdAt && typeof (user.createdAt as any).toDate === 'function') {
            startDate = (user.createdAt as any).toDate();
          } else if (typeof user.createdAt === 'string') {
            startDate = new Date(user.createdAt);
          }
        }

        // Calcular meses si tenemos una fecha válida
        if (startDate && !isNaN(startDate.getTime())) {
          const months = this.monthsDifference(startDate, today);
          if (months >= 0) { // Solo contar si es positivo
            tiempoPromedioEmpresa += months;
            countWithContract++;
          }
        }
      });

      tiempoPromedioEmpresa = countWithContract > 0
        ? Math.round((tiempoPromedioEmpresa / countWithContract) * 10) / 10
        : 0;

      const retirosVoluntarios = retiros.filter(r => r.reason === 'voluntario').length;
      const retirosInvoluntarios = retiros.filter(r => r.reason === 'involuntario').length;

      const rotacionGeneral = headcount > 0
        ? Math.round((retiros.length / headcount) * 100 * 100) / 100
        : 0;

      const rotacionVoluntaria = headcount > 0
        ? Math.round((retirosVoluntarios / headcount) * 100 * 100) / 100
        : 0;

      const rotacionEvitable = headcount > 0
        ? Math.round((retirosVoluntarios / headcount) * 100 * 100) / 100
        : 0;

      const tasaVoluntaria = retiros.length > 0
        ? Math.round((retirosVoluntarios / retiros.length) * 100 * 100) / 100
        : 0;

      // Calcular cubrimiento
      const cubrimiento = retiros.length > 0
        ? Math.round((ingresos.length / retiros.length) * 100 * 100) / 100
        : 0;

      // Calcular datos mensuales (últimos 12 meses)
      const monthlyData: MonthlyData[] = [];
      for (let i = 11; i >= 0; i--) {
        const date = new Date(currentYear, currentMonth - i, 1);
        const month = date.getMonth();
        const year = date.getFullYear();

        const monthIngresos = movements.filter(m => {
          const moveDate = new Date(m.date);
          return m.type === 'ingreso' &&
            moveDate.getMonth() === month &&
            moveDate.getFullYear() === year;
        }).length;

        const monthRetiros = movements.filter(m => {
          const moveDate = new Date(m.date);
          return m.type === 'retiro' &&
            moveDate.getMonth() === month &&
            moveDate.getFullYear() === year;
        }).length;

        const monthRotacion = headcount > 0
          ? Math.round((monthRetiros / headcount) * 100 * 100) / 100
          : 0;

        monthlyData.push({
          month: this.getMonthName(month),
          year,
          ingresos: monthIngresos,
          retiros: monthRetiros,
          rotacion: monthRotacion,
          rotacionEvitable: monthRotacion,
        });
      }

      // Calcular costos
      const costoRetiros = retiros.reduce((sum, r) => sum + (r.cost || 0), 0);

      // Retiros tempranos (menos de 3 meses)
      const retirosTempranos = retiros.filter(r => {
        const user = allUsers.find(u => u.id === r.userId);
        if (user?.contractInfo?.contract?.startDate) {
          const startDate = new Date(user.contractInfo.contract.startDate);
          const endDate = new Date(r.date);
          const months = this.monthsDifference(startDate, endDate);
          return months < 3;
        }
        return false;
      }).length;

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
        voluntarioVsInvoluntario: {
          voluntario: retirosVoluntarios,
          involuntario: retirosInvoluntarios,
        },
        externoVsInterno: {
          externo: retirosVoluntarios,
          interno: retirosInvoluntarios,
        },
        ingresosPorMes: monthlyData,
        retirosPorMes: monthlyData,
        costoRetiros,
        fracasoContratacion: headcount > 0
          ? Math.round((retirosTempranos / headcount) * 100 * 100) / 100
          : 0,
        costoRetirosTemprano: retiros
          .filter(r => {
            const user = allUsers.find(u => u.id === r.userId);
            if (user?.contractInfo?.contract?.startDate) {
              const startDate = new Date(user.contractInfo.contract.startDate);
              const endDate = new Date(r.date);
              const months = this.monthsDifference(startDate, endDate);
              return months < 3;
            }
            return false;
          })
          .reduce((sum, r) => sum + (r.cost || 0), 0),
        retirosTempranos,
      };
    } catch (error) {
      console.error('Error calculando métricas:', error);
      throw error;
    }
  }
}

export const analyticsService = new AnalyticsService();