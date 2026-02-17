import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { NotificationEvent, NotificationType } from '../models/types/Notification';

class NotificationService {
  // Calcular días entre dos fechas
  private daysBetween(date1: Date, date2: Date): number {
    const diffTime = date2.getTime() - date1.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Obtener la fecha del próximo cumpleaños
  private getNextBirthday(birthDate: Date): Date {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    let nextBirthday = new Date(
      currentYear,
      birthDate.getMonth(),
      birthDate.getDate()
    );

    // Si el cumpleaños ya pasó este año, usar el del próximo año
    if (nextBirthday < today) {
      nextBirthday = new Date(
        currentYear + 1,
        birthDate.getMonth(),
        birthDate.getDate()
      );
    }

    return nextBirthday;
  }

  // Obtener la fecha del próximo aniversario
  private getNextAnniversary(startDate: Date): Date {
    const today = new Date();
    const currentYear = today.getFullYear();
    
    let nextAnniversary = new Date(
      currentYear,
      startDate.getMonth(),
      startDate.getDate()
    );

    // Si el aniversario ya pasó este año, usar el del próximo año
    if (nextAnniversary < today) {
      nextAnniversary = new Date(
        currentYear + 1,
        startDate.getMonth(),
        startDate.getDate()
      );
    }

    return nextAnniversary;
  }

  // Calcular años de servicio
  private calculateYearsOfService(startDate: Date): number {
    const today = new Date();
    const years = today.getFullYear() - startDate.getFullYear();
    const monthDiff = today.getMonth() - startDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < startDate.getDate())) {
      return years - 1;
    }
    return years;
  }

  // Generar eventos de cumpleaños
  private generateBirthdayEvents(users: any[]): NotificationEvent[] {
    const events: NotificationEvent[] = [];
    const today = new Date();

    for (const user of users) {
      // Verificar que tenga personalData y birthDate
      if (user.personalData?.birthDate) {
        const birthDate = user.personalData.birthDate.toDate 
          ? user.personalData.birthDate.toDate() 
          : new Date(user.personalData.birthDate);
        
        const nextBirthday = this.getNextBirthday(birthDate);
        const daysUntil = this.daysBetween(today, nextBirthday);
        
        // Mostrar solo cumpleaños en los próximos 90 días
        if (daysUntil >= 0 && daysUntil <= 90) {
          const age = nextBirthday.getFullYear() - birthDate.getFullYear();
          
          events.push({
            id: `birthday_${user.id}`,
            type: 'birthday',
            userId: user.id,
            userName: user.fullName,
            date: nextBirthday,
            title: `🎂 Cumpleaños de ${user.fullName} (${age} años)`,
            daysUntil,
          });
        }
      }
    }

    return events;
  }

  // Generar eventos de aniversarios laborales
  private generateAnniversaryEvents(users: any[]): NotificationEvent[] {
    const events: NotificationEvent[] = [];
    const today = new Date();

    for (const user of users) {
      // Solo colaboradores con contractInfo
      if (user.role === 'colaborador' && user.contractInfo?.contract?.startDate) {
        const startDate = user.contractInfo.contract.startDate.toDate 
          ? user.contractInfo.contract.startDate.toDate() 
          : new Date(user.contractInfo.contract.startDate);
        
        const nextAnniversary = this.getNextAnniversary(startDate);
        const daysUntil = this.daysBetween(today, nextAnniversary);
        
        // Mostrar solo aniversarios en los próximos 90 días
        if (daysUntil >= 0 && daysUntil <= 90) {
          const yearsOfService = this.calculateYearsOfService(startDate) + 1;
          
          events.push({
            id: `anniversary_${user.id}`,
            type: 'work_anniversary',
            userId: user.id,
            userName: user.fullName,
            date: nextAnniversary,
            title: `🏆 ${user.fullName} cumple ${yearsOfService} ${yearsOfService === 1 ? 'año' : 'años'} en la empresa`,
            daysUntil,
          });
        }
      }
    }

    return events;
  }

  // Generar eventos de fin de periodo de prueba
  private generateProbationEndEvents(users: any[]): NotificationEvent[] {
    const events: NotificationEvent[] = [];
    const today = new Date();

    for (const user of users) {
      if (
        user.role === 'colaborador' &&
        user.contractInfo?.contract?.startDate && 
        user.contractInfo?.contract?.probationPeriod
      ) {
        const startDate = user.contractInfo.contract.startDate.toDate 
          ? user.contractInfo.contract.startDate.toDate() 
          : new Date(user.contractInfo.contract.startDate);

        // Extraer número de meses del periodo de prueba (ej: "3 meses" -> 3)
        const probationPeriod = user.contractInfo.contract.probationPeriod;
        const monthsMatch = probationPeriod.match(/(\d+)/);
        const months = monthsMatch ? parseInt(monthsMatch[0]) : 3;

        const probationEndDate = new Date(startDate);
        probationEndDate.setMonth(probationEndDate.getMonth() + months);

        const daysUntil = this.daysBetween(today, probationEndDate);

        // Mostrar si termina en los próximos 30 días o ya terminó hace menos de 7 días
        if (daysUntil >= -7 && daysUntil <= 30) {
          events.push({
            id: `probation_${user.id}`,
            type: 'probation_end',
            userId: user.id,
            userName: user.fullName,
            date: probationEndDate,
            title: `⏰ Fin de periodo de prueba - ${user.fullName}`,
            daysUntil,
          });
        }
      }
    }

    return events;
  }

  // Generar eventos de inicio de contrato
  private generateContractStartEvents(users: any[]): NotificationEvent[] {
    const events: NotificationEvent[] = [];
    const today = new Date();

    for (const user of users) {
      if (user.role === 'colaborador' && user.contractInfo?.contract?.startDate) {
        const startDate = user.contractInfo.contract.startDate.toDate 
          ? user.contractInfo.contract.startDate.toDate() 
          : new Date(user.contractInfo.contract.startDate);

        const daysUntil = this.daysBetween(today, startDate);

        // Mostrar si inicia en los próximos 30 días o ya inició hace menos de 7 días
        if (daysUntil >= -7 && daysUntil <= 30) {
          events.push({
            id: `contract_start_${user.id}`,
            type: 'contract_start',
            userId: user.id,
            userName: user.fullName,
            date: startDate,
            title: `📋 Inicio de contrato - ${user.fullName}`,
            daysUntil,
          });
        }
      }
    }

    return events;
  }

  // Generar eventos de fin de contrato
  private generateContractEndEvents(users: any[]): NotificationEvent[] {
    const events: NotificationEvent[] = [];
    const today = new Date();

    for (const user of users) {
      if (
        user.role === 'colaborador' &&
        user.contractInfo?.contract?.endDate
      ) {
        const endDate = user.contractInfo.contract.endDate.toDate 
          ? user.contractInfo.contract.endDate.toDate() 
          : new Date(user.contractInfo.contract.endDate);

        const daysUntil = this.daysBetween(today, endDate);

        // Mostrar si termina en los próximos 90 días
        if (daysUntil >= 0 && daysUntil <= 90) {
          events.push({
            id: `contract_end_${user.id}`,
            type: 'contract_end',
            userId: user.id,
            userName: user.fullName,
            date: endDate,
            title: `⚠️ Fin de contrato - ${user.fullName}`,
            daysUntil,
          });
        }
      }
    }

    return events;
  }

  // Obtener todos los eventos
  async getAllEvents(filters?: NotificationType[]): Promise<NotificationEvent[]> {
    try {
      // Obtener todos los usuarios
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      let allEvents: NotificationEvent[] = [];

      // Generar eventos según filtros
      if (!filters || filters.length === 0 || filters.includes('birthday')) {
        allEvents = [...allEvents, ...this.generateBirthdayEvents(users)];
      }

      if (!filters || filters.length === 0 || filters.includes('work_anniversary')) {
        allEvents = [...allEvents, ...this.generateAnniversaryEvents(users)];
      }

      if (!filters || filters.length === 0 || filters.includes('probation_end')) {
        allEvents = [...allEvents, ...this.generateProbationEndEvents(users)];
      }

      if (!filters || filters.length === 0 || filters.includes('contract_start')) {
        allEvents = [...allEvents, ...this.generateContractStartEvents(users)];
      }

      if (!filters || filters.length === 0 || filters.includes('contract_end')) {
        allEvents = [...allEvents, ...this.generateContractEndEvents(users)];
      }

      // Ordenar por fecha
      allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

      return allEvents;
    } catch (error) {
      console.error('Error obteniendo eventos:', error);
      throw error;
    }
  }

  // Obtener estadísticas
  async getStats(filters?: NotificationType[]) {
    const events = await this.getAllEvents(filters);

    return {
      total: events.length,
      thisWeek: events.filter(e => e.daysUntil >= 0 && e.daysUntil <= 7).length,
      thisMonth: events.filter(e => e.daysUntil >= 0 && e.daysUntil <= 30).length,
      overdue: events.filter(e => e.daysUntil < 0).length,
    };
  }
}

export const notificationService = new NotificationService();