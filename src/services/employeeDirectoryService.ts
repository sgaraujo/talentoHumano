import { collection, collectionGroup, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/config/firestoreCollections';
import type { Company } from '@/models/types/Company';
import type { Project } from '@/models/types/Project';
import type { User } from '@/models/types/User';
import { toDate } from './analyticsService';

/**
 * Un retiro (status 'retired') deja de contar como activo de inmediato, sin
 * importar su fecha de salida — así lo pidió el negocio: nadie marcado como
 * retirado debe seguir recibiendo comunicaciones ni sumando en el headcount.
 * También exige que el contrato ya haya empezado (startDate <= hoy).
 */
const isActiveToday = (relationship: any): boolean => {
  if (relationship.status !== 'active') return false;
  const start = toDate(relationship.startDate);
  return !!start && start <= new Date();
};

// Clave de comparación, no de presentación: hace equivalentes, por ejemplo,
// "INTEEGRA S.A.S BIC" e "INTEEGRA SAS BIC".
const normalize = (value: unknown) => String(value ?? '').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]/g, '');

/**
 * Directorio de colaboradores derivado de la fuente oficial de Talento Humano
 * (employees + employments). Es la misma fuente que usan "Empresas y dotación"
 * y la analítica de rotación — reemplaza a la antigua colección `users`, que
 * quedaba desincronizada de las altas/bajas reales y producía conteos
 * incorrectos en WhatsApp, Boletines y Correos.
 */
export async function getEmployeeDirectoryUsers(): Promise<User[]> {
  const [companiesSnap, projectsSnap, employeesSnap, employmentsSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.projects)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.employees)),
    getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.users)),
  ]);
  const companies = companiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Company));
  const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
  const companyIdByName = new Map<string, string>();
  companies.forEach(company => {
    [company.name, ...(company.aliases ?? [])].forEach(name => companyIdByName.set(normalize(name), company.id));
  });
  const companyNameById = new Map(companies.map(company => [company.id, company.name]));
  const projectIdByCompanyAndName = new Map(projects.map(project => [
    `${project.companyId}|${normalize(project.name)}`, project.id,
  ]));
  const employmentsByEmployee = new Map<string, any[]>();
  employmentsSnap.docs.forEach(snapshot => {
    const relationship = snapshot.data() as any;
    const employeeId = relationship.employeeId || snapshot.ref.parent.parent?.id;
    if (!employeeId) return;
    if (!employmentsByEmployee.has(employeeId)) employmentsByEmployee.set(employeeId, []);
    employmentsByEmployee.get(employeeId)!.push(relationship);
  });
  const cleanDocument = (value: unknown) => String(value ?? '').replace(/\D/g, '');
  const cleanEmail = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('es');
  const legacyUsers = usersSnap.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() } as any));
  const legacyById = new Map(legacyUsers.map(user => [user.id, user]));
  const legacyByDocument = new Map(legacyUsers
    .map(user => [cleanDocument(user.personalData?.documentNumber), user] as const)
    .filter(([key]) => key));
  const legacyByEmail = new Map(legacyUsers
    .flatMap(user => [user.email, user.location?.corporateEmail, user.location?.personalEmail]
      .map(email => [cleanEmail(email), user] as const))
    .filter(([key]) => key));

  return employeesSnap.docs.map(snapshot => {
    const employee = snapshot.data() as any;
    const legacyUser = legacyById.get(employee.identityUserId)
      ?? legacyByDocument.get(cleanDocument(employee.documentNumber))
      ?? legacyByEmail.get(cleanEmail(employee.corporateEmail))
      ?? legacyByEmail.get(cleanEmail(employee.personalEmail));
    const allRelationships = employmentsByEmployee.get(snapshot.id) ?? [];
    const activeRelationships = allRelationships.filter(isActiveToday);
    const toAssignment = (relationship: any) => {
      const companyId = companyIdByName.get(normalize(relationship.companyName));
      const projectId = companyId
        ? projectIdByCompanyAndName.get(`${companyId}|${normalize(relationship.projectName)}`)
        : undefined;
      const company = companyId ? companyNameById.get(companyId)! : relationship.companyName;
      return {
        companyId, projectId, company, project: relationship.projectName,
        contractType: relationship.contractType, modality: relationship.modality,
        startDate: relationship.startDate, endDate: relationship.endDate, status: relationship.status,
      };
    };
    const assignments = activeRelationships.map(toAssignment);
    const allAssignments = allRelationships.map(toAssignment);
    const primaryRelationship = activeRelationships[0];
    return {
      id: employee.identityUserId || `employee:${snapshot.id}`,
      fullName: employee.fullName,
      email: employee.corporateEmail || employee.personalEmail || '',
      role: activeRelationships.length ? 'colaborador' : 'excolaborador',
      profileCompleted: false, completedOnboardings: [],
      companyIds: [...new Set(assignments.map(item => item.companyId).filter(Boolean))],
      projectIds: [...new Set(assignments.map(item => item.projectId).filter(Boolean))],
      personalData: {
        documentNumber: employee.documentNumber, phone: employee.personalPhone,
        birthDate: employee.birthDate ?? employee.fechaNacimiento
          ?? legacyUser?.personalData?.birthDate ?? legacyUser?.personalData?.fechaNacimiento,
        age: employee.age ?? employee.edad ?? legacyUser?.personalData?.age ?? legacyUser?.personalData?.edad,
        ageRange: employee.ageRange ?? employee.rangoEdad
          ?? legacyUser?.personalData?.ageRange ?? legacyUser?.personalData?.rangoEdad,
        gender: employee.gender ?? legacyUser?.personalData?.gender,
      },
      location: { corporatePhone: employee.corporatePhone, city: employee.residence?.city },
      contractInfo: {
        assignment: assignments[0] ?? {},
        contract: { startDate: primaryRelationship?.startDate, contractType: primaryRelationship?.contractType },
        workConditions: { workModality: primaryRelationship?.modality },
      },
      _assignments: assignments,
      _allAssignments: allAssignments,
    } as any as User;
  });
}
