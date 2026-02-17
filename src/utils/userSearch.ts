import { User } from "@/models/types/User";


export function getNombre(u: User) {
  return (u.personalData?.fullName || u.fullName || "").trim();
}

export function getCarrera(u: User) {
  return (
    u.professionalProfile?.undergraduate ||
    u.professionalProfile?.degree ||
    u.professionalProfile?.knowledgeArea ||
    ""
  ).trim();
}

export function getUniversidad(u: User) {
  return (
    u.professionalProfile?.university ||
    u.professionalProfile?.educationalInstitution ||
    ""
  ).trim();
}

export function getCargo(u: User) {
  return (
    u.personalData?.position ||
    u.contractInfo?.assignment?.position ||
    u.professionalProfile?.experience?.lastPosition ||
    ""
  ).trim();
}

export function getDocumento(u: User) {
  return (u.personalData?.documentNumber || "").trim();
}

export function tieneEspecializacion(u: User): boolean {
  const p = u.professionalProfile;
  const text = [p?.academicLevel, p?.degree, ...(p?.programs ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    text.includes("especializ") ||
    text.includes("posgrad") ||
    text.includes("maestr") ||
    text.includes("master") ||
    text.includes("mba") ||
    text.includes("doctor") ||
    text.includes("phd")
  );
}
