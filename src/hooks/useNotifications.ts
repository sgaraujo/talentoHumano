import { useState, useEffect } from 'react';
import { notificationService } from '../services/notificationService';
import type { NotificationEvent, NotificationType } from '../models/types/Notification';

export const useNotifications = () => {
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    thisWeek: 0,
    thisMonth: 0,
    overdue: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<NotificationType[]>([]);

  const loadEvents = async (activeFilters?: NotificationType[], maxDays = 365) => {
    try {
      setLoading(true);
      setError(null);
      const data = await notificationService.getAllEvents(activeFilters, maxDays);
      setEvents(data);
      const statsData = await notificationService.getStats(activeFilters);
      setStats(statsData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (newFilters: NotificationType[], maxDays = 365) => {
    setFilters(newFilters);
    loadEvents(newFilters, maxDays);
  };

  const clearFilters = () => {
    setFilters([]);
    loadEvents([]);
  };

  useEffect(() => {
    loadEvents();
  }, []);

  return {
    events,
    stats,
    loading,
    error,
    filters,
    applyFilters,
    clearFilters,
    refreshEvents: loadEvents,
  };
};