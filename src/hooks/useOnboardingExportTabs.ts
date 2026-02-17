// src/hooks/useOnboardingExportTabs.ts
import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "@/config/firebase";
import type { Questionnaire } from "@/models/types/Questionnaire";

export function useOnboardingExportTabs() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      // ✅ SOLO ACTIVOS (5 deberían aparecer aquí)
      const q = query(
        collection(db, "questionnaires"),
        where("active", "==", true),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);

      const data = snap.docs.map((d) => {
        const x: any = d.data();
        return {
          id: d.id,
          ...x,
          createdAt: x.createdAt?.toDate?.() || x.createdAt,
          updatedAt: x.updatedAt?.toDate?.() || x.updatedAt,
        } as Questionnaire;
      });

      setQuestionnaires(data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || String(e));
      setQuestionnaires([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { loading, error, questionnaires, refresh };
}
