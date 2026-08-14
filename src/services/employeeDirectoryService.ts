import { collection, collectionGroup, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/config/firestoreCollections';
import type { Company } from '@/models/types/Company';
import type { Project } from '@/models/types/Project';
import type { User } from '@/models/types/User';

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
  const [companiesSnap, projectsSnap, employeesSnap, employmentsSnap] = await Promise.all([
    getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.projects)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.employees)),
    getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
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
  return employeesSnap.docs.map(snapshot => {
    const employee = snapshot.data() as any;
    const activeRelationships = (employmentsByEmployee.get(snapshot.id) ?? []).filter(item => item.status === 'active');
    const assignments = activeRelationships.map(relationship => {
      const companyId = companyIdByName.get(normalize(relationship.companyName));
      const projectId = companyId
        ? projectIdByCompanyAndName.get(`${companyId}|${normalize(relationship.projectName)}`)
        : undefined;
      const company = companyId ? companyNameById.get(companyId)! : relationship.companyName;
      return { companyId, projectId, company, project: relationship.projectName };
    });
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
        birthDate: employee.birthDate, gender: employee.gender,
      },
      location: { corporatePhone: employee.corporatePhone, city: employee.residence?.city },
      contractInfo: {
        assignment: assignments[0] ?? {},
        contract: { startDate: primaryRelationship?.startDate, contractType: primaryRelationship?.contractType },
        workConditions: { workModality: primaryRelationship?.modality },
      },
      _assignments: assignments,
    } as any as User;
  });
}
