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

  private userMeta(user: any) {
    return {
      company:  user.contractInfo?.assignment?.company  || '',
      project:  user.contractInfo?.assignment?.project  || '',
      position: user.contractInfo?.assignment?.position || user.personalData?.position || '',
    };
  }

  private generateBirthdayEvents(users: any[], maxDays = 365): NotificationEvent[] {
    const events: NotificationEvent[] = [];
    const today = new Date();
    for (const user of users) {
      if (!user.personalData?.birthDate) continue;
      const birthDate = user.personalData.birthDate.toDate
        ? user.personalData.birthDate.toDate()
        : new Date(user.personalData.birthDate);
      const nextBirthday = this.getNextBirthday(birthDate);
      const daysUntil = this.daysBetween(today, nextBirthday);
      if (daysUntil >= 0 && daysUntil <= maxDays) {
        const age = nextBirthday.getFullYear() - birthDate.getFullYear();
        events.push({
          id: `birthday_${user.id}`,
          type: 'birthday',
          userId: user.id,
          userName: user.fullName,
          date: nextBirthday,
          title: `🎂 Cumpleaños de ${user.fullName} (${age} años)`,
          daysUntil,
          ...this.userMeta(user),
        });
      }
    }
    return events;
  }

  private generateAnniversaryEvents(users: any[], maxDays = 365): NotificationEvent[] {
    const events: NotificationEvent[] = [];
    const today = new Date();
    for (const user of users) {
      if (user.role !== 'colaborador' || !user.contractInfo?.contract?.startDate) continue;
      const startDate = user.contractInfo.contract.startDate.toDate
        ? user.contractInfo.contract.startDate.toDate()
        : new Date(user.contractInfo.contract.startDate);
      const nextAnniversary = this.getNextAnniversary(startDate);
      const daysUntil = this.daysBetween(today, nextAnniversary);
      if (daysUntil >= 0 && daysUntil <= maxDays) {
        const yearsOfService = this.calculateYearsOfService(startDate) + 1;
        events.push({
          id: `anniversary_${user.id}`,
          type: 'work_anniversary',
          userId: user.id,
          userName: user.fullName,
          date: nextAnniversary,
          title: `🏆 ${user.fullName} cumple ${yearsOfService} ${yearsOfService === 1 ? 'año' : 'años'} en la empresa`,
          daysUntil,
          ...this.userMeta(user),
        });
      }
    }
    return events;
  }

  private generateProbationEndEvents(users: any[], maxDays = 365): NotificationEvent[] {
    const events: NotificationEvent[] = [];
    const today = new Date();
    for (const user of users) {
      if (user.role !== 'colaborador' || !user.contractInfo?.contract?.startDate || !user.contractInfo?.contract?.probationPeriod) continue;
      const startDate = user.contractInfo.contract.startDate.toDate
        ? user.contractInfo.contract.startDate.toDate()
        : new Date(user.contractInfo.contract.startDate);
      const monthsMatch = user.contractInfo.contract.probationPeriod.match(/(\d+)/);
      const months = monthsMatch ? parseInt(monthsMatch[0]) : 3;
      const probationEndDate = new Date(startDate);
      probationEndDate.setMonth(probationEndDate.getMonth() + months);
      const daysUntil = this.daysBetween(today, probationEndDate);
      if (daysUntil >= -7 && daysUntil <= maxDays) {
        events.push({
          id: `probation_${user.id}`,
          type: 'probation_end',
          userId: user.id,
          userName: user.fullName,
          date: probationEndDate,
          title: `⏰ Fin de periodo de prueba - ${user.fullName}`,
          daysUntil,
          ...this.userMeta(user),
        });
      }
    }
    return events;
  }

  private generateContractStartEvents(users: any[], maxDays = 365): NotificationEvent[] {
    const events: NotificationEvent[] = [];
    const today = new Date();
    for (const user of users) {
      if (user.role !== 'colaborador' || !user.contractInfo?.contract?.startDate) continue;
      const startDate = user.contractInfo.contract.startDate.toDate
        ? user.contractInfo.contract.startDate.toDate()
        : new Date(user.contractInfo.contract.startDate);
      const daysUntil = this.daysBetween(today, startDate);
      if (daysUntil >= -7 && daysUntil <= maxDays) {
        events.push({
          id: `contract_start_${user.id}`,
          type: 'contract_start',
          userId: user.id,
          userName: user.fullName,
          date: startDate,
          title: `📋 Inicio de contrato - ${user.fullName}`,
          daysUntil,
          ...this.userMeta(user),
        });
      }
    }
    return events;
  }

  private generateContractEndEvents(users: any[], maxDays = 365): NotificationEvent[] {
    const events: NotificationEvent[] = [];
    const today = new Date();
    for (const user of users) {
      if (user.role !== 'colaborador' || !user.contractInfo?.contract?.endDate) continue;
      const endDate = user.contractInfo.contract.endDate.toDate
        ? user.contractInfo.contract.endDate.toDate()
        : new Date(user.contractInfo.contract.endDate);
      const daysUntil = this.daysBetween(today, endDate);
      if (daysUntil >= 0 && daysUntil <= maxDays) {
        events.push({
          id: `contract_end_${user.id}`,
          type: 'contract_end',
          userId: user.id,
          userName: user.fullName,
          date: endDate,
          title: `⚠️ Fin de contrato - ${user.fullName}`,
          daysUntil,
          ...this.userMeta(user),
        });
      }
    }
    return events;
  }

  async getAllEvents(filters?: NotificationType[], maxDays = 90): Promise<NotificationEvent[]> {
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      let allEvents: NotificationEvent[] = [];
      const all = !filters || filters.length === 0;

      if (all || filters!.includes('birthday'))         allEvents.push(...this.generateBirthdayEvents(users, maxDays));
      if (all || filters!.includes('work_anniversary')) allEvents.push(...this.generateAnniversaryEvents(users, maxDays));
      if (all || filters!.includes('probation_end'))    allEvents.push(...this.generateProbationEndEvents(users, maxDays));
      if (all || filters!.includes('contract_start'))   allEvents.push(...this.generateContractStartEvents(users, maxDays));
      if (all || filters!.includes('contract_end'))     allEvents.push(...this.generateContractEndEvents(users, maxDays));

      allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
      return allEvents;
    } catch (error) {
      console.error('Error obteniendo eventos:', error);
      throw error;
    }
  }

  // Para el calendario: genera todos los eventos de un mes/año concreto
  // sin restricción de "días futuros" — muestra todo el mes aunque ya haya pasado
  async getEventsForMonth(year: number, month: number): Promise<NotificationEvent[]> {
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const today = new Date();
      const events: NotificationEvent[] = [];

      for (const user of users) {
        const meta = this.userMeta(user);

        // Cumpleaños
        if (user.personalData?.birthDate) {
          const bd = user.personalData.birthDate.toDate
            ? user.personalData.birthDate.toDate()
            : new Date(user.personalData.birthDate);
          const eventDate = new Date(year, month, bd.getDate());
          if (eventDate.getMonth() === month) {
            const age = year - bd.getFullYear();
            const daysUntil = this.daysBetween(today, eventDate);
            events.push({
              id: `birthday_${user.id}_${year}_${month}`,
              type: 'birthday',
              userId: user.id,
              userName: user.fullName,
              date: eventDate,
              title: `🎂 Cumpleaños de ${user.fullName} (${age} años)`,
              daysUntil,
              ...meta,
            });
          }
        }

        // Aniversarios laborales
        if (user.role === 'colaborador' && user.contractInfo?.contract?.startDate) {
          const sd = user.contractInfo.contract.startDate.toDate
            ? user.contractInfo.contract.startDate.toDate()
            : new Date(user.contractInfo.contract.startDate);
          const eventDate = new Date(year, month, sd.getDate());
          if (eventDate.getMonth() === month && sd.getMonth() === month) {
            const years = year - sd.getFullYear();
            if (years > 0) {
              const daysUntil = this.daysBetween(today, eventDate);
              events.push({
                id: `anniversary_${user.id}_${year}_${month}`,
                type: 'work_anniversary',
                userId: user.id,
                userName: user.fullName,
                date: eventDate,
                title: `🏆 ${user.fullName} cumple ${years} ${years === 1 ? 'año' : 'años'} en la empresa`,
                daysUntil,
                ...meta,
              });
            }
          }
        }

        // Fin de contrato (fecha exacta)
        if (user.role === 'colaborador' && user.contractInfo?.contract?.endDate) {
          const ed = user.contractInfo.contract.endDate.toDate
            ? user.contractInfo.contract.endDate.toDate()
            : new Date(user.contractInfo.contract.endDate);
          if (ed.getMonth() === month && ed.getFullYear() === year) {
            events.push({
              id: `contract_end_${user.id}`,
              type: 'contract_end',
              userId: user.id,
              userName: user.fullName,
              date: ed,
              title: `⚠️ Fin de contrato - ${user.fullName}`,
              daysUntil: this.daysBetween(today, ed),
              ...meta,
            });
          }
        }

        // Inicio de contrato (fecha exacta)
        if (user.role === 'colaborador' && user.contractInfo?.contract?.startDate) {
          const sd = user.contractInfo.contract.startDate.toDate
            ? user.contractInfo.contract.startDate.toDate()
            : new Date(user.contractInfo.contract.startDate);
          if (sd.getMonth() === month && sd.getFullYear() === year) {
            events.push({
              id: `contract_start_${user.id}`,
              type: 'contract_start',
              userId: user.id,
              userName: user.fullName,
              date: sd,
              title: `📋 Inicio de contrato - ${user.fullName}`,
              daysUntil: this.daysBetween(today, sd),
              ...meta,
            });
          }
        }
      }

      events.sort((a, b) => a.date.getTime() - b.date.getTime());
      return events;
    } catch (error) {
      console.error('Error obteniendo eventos del mes:', error);
      return [];
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