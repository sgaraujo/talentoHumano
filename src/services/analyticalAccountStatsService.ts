import { collection, collectionGroup, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/config/firestoreCollections';
import type { Company } from '@/models/types/Company';
import type { Project } from '@/models/types/Project';
import type { EmployeeRecord, EmploymentRelationship } from '@/models/types/HumanResourceRecord';

// Campos históricos que algunos expedientes traen con otro nombre.
type EmployeeDoc = Partial<EmployeeRecord> & {
  fechaNacimiento?: unknown; age?: number; edad?: number; ageRange?: string; rangoEdad?: string;
};
import { analyticalAccountOf, isApprenticeRelation, toDate } from '@/services/analyticsService';
import { mapWithConcurrency } from '@/services/companyWorkforceService';

/** Persona con contrato vigente en la cuenta analítica (una fila por relación laboral). */
export interface AccountPerson {
  employmentId: string;
  employeeId: string;
  fullName: string;
  documentNumber: string;
  position?: string;
  contractType?: string;
  modality?: string;
  workday?: string;
  regional?: string;
  baseLocation?: string;
  area?: string;
  supervisor?: string;
  startDate: Date | null;
  gender?: string;
  birthDate?: unknown;
  age?: number;
  ageRange?: string;
  identityUserId?: string | null;
  corporateEmail?: string;
  corporatePhone?: string;
  isApprentice: boolean;
}

export interface AnalyticalAccountStats {
  project: Project;
  company: Company | null;
  people: AccountPerson[];
}

// Clave de comparación: sin tildes, mayúsculas, puntos ni espacios.
const normalize = (value?: unknown) => String(value ?? '').trim().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]/g, '');

/**
 * Foto actual de una cuenta analítica: relaciones laborales activas cuya
 * empresa es la de la cuenta y cuya cuenta analítica (projectName o
 * analyticalAccount) coincide con el nombre de la cuenta o uno de sus alias.
 * No lee nómina: las estadísticas por cuenta no muestran salarios.
 */
export async function getAnalyticalAccountStats(projectId: string): Promise<AnalyticalAccountStats> {
  const [projectSnap, companiesSnap, employmentsSnap] = await Promise.all([
    getDoc(doc(db, FIRESTORE_COLLECTIONS.projects, projectId)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
    getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
  ]);
  if (!projectSnap.exists()) throw new Error('La cuenta analítica no existe.');
  const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
  const companies = companiesSnap.docs.map(item => ({ id: item.id, ...item.data() } as Company));
  const company = companies.find(c => c.id === project.companyId)
    ?? companies.find(c => normalize(c.name) === normalize(project.companyName))
    ?? null;

  const companyNames = company ? [company.name, ...(company.aliases ?? [])].map(normalize) : [normalize(project.companyName)];
  const accountNames = new Set([project.name, ...(project.aliases ?? [])].map(normalize));

  const relations = employmentsSnap.docs
    .map(item => {
      const data = item.data() as EmploymentRelationship;
      return { ...data, id: item.id, employeeId: data.employeeId || item.ref.parent.parent?.id || '' };
    })
    .filter(r => r.status === 'active'
      && ((!!company && r.companyId === company.id) || companyNames.includes(normalize(r.companyName)))
      && accountNames.has(normalize(analyticalAccountOf(r))));

  const employeeIds = [...new Set(relations.map(r => r.employeeId).filter(Boolean))];
  const employees = new Map(await mapWithConcurrency(employeeIds, 20, async id => {
    const snapshot = await getDoc(doc(db, FIRESTORE_COLLECTIONS.employees, id));
    return [id, (snapshot.data() ?? {}) as EmployeeDoc] as const;
  }));

  const people: AccountPerson[] = relations.map(r => {
    const employee: EmployeeDoc = employees.get(r.employeeId) ?? {};
    return {
      employmentId: r.id,
      employeeId: r.employeeId,
      fullName: employee.fullName || 'Sin nombre',
      documentNumber: employee.documentNumber || r.employeeId,
      position: r.position,
      contractType: r.contractType,
      modality: r.modality,
      workday: r.workday,
      regional: r.regional,
      baseLocation: r.baseLocation,
      area: r.area,
      supervisor: r.supervisor,
      startDate: toDate(r.startDate),
      gender: employee.gender,
      birthDate: employee.birthDate ?? employee.fechaNacimiento,
      age: employee.age ?? employee.edad,
      ageRange: employee.ageRange ?? employee.rangoEdad,
      identityUserId: employee.identityUserId ?? null,
      corporateEmail: employee.corporateEmail,
      corporatePhone: employee.corporatePhone,
      isApprentice: isApprenticeRelation(r),
    };
  }).sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));

  return { project, company, people };
}
