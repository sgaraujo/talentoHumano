import { db } from "@/config/firebase";
import { User, UserRole } from "@/models/types/User";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";


export type UserSearchFilters = {
  text?: string; // nombre, email, documento, cargo
  role?: UserRole | "all";
  onlyWithSpecialization?: boolean;
  limit?: number;
};

function normalize(s: string) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function hasSpecialization(u: User) {
  // Ajusta a tus campos reales:
  // Ejemplo: professionalProfile?.academicLevel o professionalProfile?.programs etc.
  const prof = u.professionalProfile;
  const programs = prof?.programs ?? [];
  const academicLevel = prof?.academicLevel ?? "";
  // criterio simple: si menciona especialización en academicLevel o programs
  const joined = normalize([academicLevel, ...programs].join(" "));
  return joined.includes("especializacion") || joined.includes("especialización");
}

export async function searchUsers(filters: UserSearchFilters) {
  const take = filters.limit ?? 500;

  // 🔎 Firestore: filtro por rol si se requiere
  const base = collection(db, "users");
  const q =
    filters.role && filters.role !== "all"
      ? query(base, where("role", "==", filters.role), orderBy("fullName"), limit(take))
      : query(base, orderBy("fullName"), limit(take));

  const snap = await getDocs(q);

  const users: User[] = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      ...data,
      id: d.id, // docId = uid
    } as User;
  });

  const text = normalize(filters.text || "");

  // 🔎 Filtro frontend por texto
  let result = users;
  if (text) {
    result = users.filter((u) => {
      const candidates = [
        u.fullName,
        u.email,
        u.personalData?.documentNumber,
        u.personalData?.position,
        u.professionalProfile?.degree,
        u.professionalProfile?.undergraduate,
        u.professionalProfile?.knowledgeArea,
      ]
        .filter(Boolean)
        .join(" ");

      return normalize(candidates).includes(text);
    });
  }

  // ✅ filtro “tiene especialización”
  if (filters.onlyWithSpecialization) {
    result = result.filter(hasSpecialization);
  }

  return result;
}
