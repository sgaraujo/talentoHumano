import { useState, useEffect } from 'react';
import { analyticsService } from '../services/analyticsService';
import type { RotationMetrics, FilterOptions } from '../models/types/Analytics';

export const useAnalytics = () => {
  const [metrics, setMetrics] = useState<RotationMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async (filters?: FilterOptions) => {
    try {
      setLoading(true);
      setError(null);
      const data = await analyticsService.getRotationMetrics(filters);
      setMetrics(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  return {
    metrics,
    loading,
    error,
    refreshMetrics: loadMetrics,
  };
};