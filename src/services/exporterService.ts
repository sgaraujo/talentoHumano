import type { Questionnaire } from "@/models/types/Questionnaire";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { arrayUnion } from "firebase/firestore";

function coerceValue(fieldPath: string, value: any) {
  // 🔢 Números (ajusta si necesitas más paths numéricos)
  const numberPaths = new Set<string>([
    "personalData.age",
    "demographicData.socioeconomicLevel",
    "preferences.salaryExpectation",
    "professionalProfile.currentSemester",
    "professionalProfile.experience.yearsOfExperience",
    "contractInfo.workConditions.baseSalary",
    "contractInfo.workConditions.nonConstitutiveAmount",
    "family.numberOfCohabitants",
    "family.numberOfChildren",
  ]);

  // 📅 Fechas (ajusta si necesitas más)
  const datePaths = new Set<string>([
    "personalData.birthDate",
    "contractInfo.contract.startDate",
    "contractInfo.contract.endDate",
  ]);

  if (datePaths.has(fieldPath)) {
    // viene como "YYYY-MM-DD" desde <input type="date">
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }

  if (numberPaths.has(fieldPath)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }

  return value;
}

export const exporterService = {
  async exportOnboarding(params: {
    questionnaire: Questionnaire;
    userId: string; // <-- debe ser UID real
    answers: Record<string, any>;
  }) {
    const { questionnaire, userId, answers } = params;

    if (!questionnaire.isOnboarding) return;
    if (!questionnaire.fieldMappings?.length) return;

    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    const current = snap.exists() ? snap.data() : {};

    // ✅ Si el doc no existe, créalo mínimo para que no falle update/merge
    if (!snap.exists()) {
      await setDoc(
        userRef,
        {
          email: current?.email ?? "",
          fullName: current?.fullName ?? "",
          role: current?.role ?? "colaborador",
          profileCompleted: false,
          completedOnboardings: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }

    const updates: Record<string, any> = {
      updatedAt: new Date(),
      completedOnboardings: arrayUnion(questionnaire.id),
    };

    if (questionnaire.isRequired) {
      updates.profileCompleted = true;
    }

    for (const m of questionnaire.fieldMappings) {
      const raw = answers[m.questionId];
      if (raw === undefined || raw === null || raw === "") continue;

      const currentValue = m.fieldPath
        .split(".")
        .reduce((obj: any, key: string) => obj?.[key], current as any);

      if (m.overwrite === true || currentValue === undefined || currentValue === null || currentValue === "") {
        updates[m.fieldPath] = coerceValue(m.fieldPath, raw);
      }
    }

    // ✅ Usa setDoc merge:true para que no falle si el doc estaba vacío
    await setDoc(userRef, updates, { merge: true });
  },
};
