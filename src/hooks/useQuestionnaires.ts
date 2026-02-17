import { useState, useEffect } from 'react';
import { questionnaireService } from '../services/questionnaireService';
import type { Questionnaire } from '../models/types/Questionnaire';

export const useQuestionnaires = () => {
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuestionnaires = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await questionnaireService.getAll();
      setQuestionnaires(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await questionnaireService.getStats();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createQuestionnaire = async (data: Omit<Questionnaire, 'id'>) => {
    try {
      setLoading(true);
      setError(null);
      const id = await questionnaireService.create(data);
      await loadQuestionnaires();
      await loadStats();
      return id;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateQuestionnaire = async (id: string, data: Partial<Questionnaire>) => {
    try {
      setLoading(true);
      setError(null);
      await questionnaireService.update(id, data);
      await loadQuestionnaires();
      await loadStats();
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteQuestionnaire = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await questionnaireService.delete(id);
      await loadQuestionnaires();
      await loadStats();
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestionnaires();
    loadStats();
  }, []);

  const toggleActive = async (id: string, active: boolean) => {
  try {
    setLoading(true);
    setError(null);
    await questionnaireService.update(id, { active });
    await loadQuestionnaires();
    await loadStats();
  } catch (err: any) {
    setError(err.message);
    throw err;
  } finally {
    setLoading(false);
  }
};
  return {
    questionnaires,
    stats,
    loading,
    error,
    createQuestionnaire,
    updateQuestionnaire,
    deleteQuestionnaire,
    toggleActive,
    refreshQuestionnaires: loadQuestionnaires,
  };
};