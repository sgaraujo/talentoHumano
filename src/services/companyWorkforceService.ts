import { collection, collectionGroup, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/config/firestoreCollections';
import type { Company } from '@/models/types/Company';
import type { Project } from '@/models/types/Project';
import { isSenaApprentice } from '@/services/analyticsService';

export interface CompanyWorkforcePerson {
  employeeId: string;
  documentNumber: string;
  fullName: string;
  identityUserId?: string | null;
  corporateEmail?: string;
  corporatePhone?: string;
  companyName: string;
  projectName?: string;
  analyticalAccount?: string;
  contractType?: string;
  position?: string;
  area?: string;
  regional?: string;
  baseLocation?: string;
  startDate?: string;
  endDate?: string;
  gender?: string;
  birthDate?: string;
  terminationReason?: string;
  terminationCost?: number;
  status: 'active' | 'retired';
  isApprentice?: boolean;
  payroll?: {
    baseSalary?: number;
    transportAllowance?: number;
    operationalAllowance?: number;
    foodAllowance?: number;
    supportAllowance?: number;
    vehicleAllowance?: number;
    toolsAllowance?: number;
    communicationAllowance?: number;
    salaryKpi?: number;
  };
}

export interface CompanyWorkforceSummary {
  company: Company;
  people: CompanyWorkforcePerson[];
  projects: Project[];
  activePeople: number;
  retiredPeople: number;
  withoutAccess: number;
  activeProjects: number;
  incompleteRecords: number;
  monthlyBaseSalary: number;
  monthlyAllowances: number;
  monthlySalaryKpi: number;
  monthlyPayrollTotal: number;
}

const normalize = (value?: string) => String(value ?? '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const belongsToCompany = (relation: any, company: Company) => {
  if (relation.companyId && relation.companyId === company.id) return true;
  const acceptedNames = [company.name, ...(company.aliases ?? [])].map(normalize);
  return acceptedNames.includes(normalize(relation.companyName));
};

const belongsProjectToCompany = (project: any, company: Company) =>
  project.companyId === company.id || (!!project.companyName && normalize(project.companyName) === normalize(company.name));

interface MetricsRelation {
  employeeId: string;
  status: 'active' | 'retired';
  isApprentice: boolean;
  identityUserId?: string | null;
  projectName?: string;
  analyticalAccount?: string;
  position?: string;
  corporateEmail?: string;
  corporatePhone?: string;
}

// Única fuente de verdad para los KPI de empresa: la tarjeta en /empresas y el
// detalle /empresas/:id deben mostrar exactamente los mismos números.
// Los aprendices SENA no cuentan como headcount (mismo criterio que en
// Rotación y en el Dashboard de Talento Humano), pero sí siguen contando en
// "Sin acceso" y "Datos incompletos" porque son relaciones reales que hay
// que gestionar.
function computeCompanyMetrics(relations: MetricsRelation[], projects: Array<{ status?: string }>) {
  const active = relations.filter(item => item.status === 'active');
  const uniqueActive = new Set(active.filter(item => !item.isApprentice).map(item => item.employeeId));
  const uniqueRetired = new Set(relations.filter(item => item.status === 'retired').map(item => item.employeeId));
  return {
    activePeople: uniqueActive.size,
    retiredPeople: [...uniqueRetired].filter(id => !uniqueActive.has(id)).length,
    withoutAccess: new Set(active.filter(item => !item.identityUserId).map(item => item.employeeId)).size,
    activeProjects: projects.filter(item => item.status === 'activo').length,
    // "Cuenta analítica" se considera presente con projectName (vinculado al
    // proyecto/cuenta maestro) O analyticalAccount (texto libre del Excel) —
    // el expediente muestra analyticalAccount, así que si solo falta
    // projectName (pendiente de vincular al proyecto) no debe marcarse como
    // dato faltante para la persona.
    incompleteRecords: active.filter(item => (!item.projectName && !item.analyticalAccount) || !item.position || !item.corporateEmail || !item.corporatePhone).length,
  };
}

export async function getCompanyWorkforce(companyId: string): Promise<CompanyWorkforceSummary> {
  const [companySnap, employeeSnap, employmentSnap, projectSnap] = await Promise.all([
    getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.employees)),
    getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.projects)),
  ]);
  const company = companySnap.docs.find(item => item.id === companyId);
  if (!company) throw new Error('La empresa no existe.');
  const companyValue = { id: company.id, ...company.data() } as Company;
  const employees = new Map(employeeSnap.docs.map(item => [item.id, item.data() as any]));
  const companyRelations = employmentSnap.docs.filter(item => belongsToCompany(item.data(), companyValue));
  const people = await Promise.all(companyRelations.map(async item => {
      const data = item.data();
      const relation = { id: item.id, ...data, employeeId: data.employeeId || item.ref.parent.parent?.id } as any;
      const employee = employees.get(relation.employeeId) ?? {};
      const payrollSnap = await getDoc(doc(item.ref, FIRESTORE_SUBCOLLECTIONS.employeePrivateData, 'payroll'));
      return {
        employeeId: relation.employeeId,
        documentNumber: employee.documentNumber || relation.employeeId,
        fullName: employee.fullName || 'Sin nombre',
        identityUserId: employee.identityUserId,
        corporateEmail: employee.corporateEmail,
        corporatePhone: employee.corporatePhone,
        companyName: relation.companyName || companyValue.name,
        projectName: relation.projectName,
        analyticalAccount: relation.analyticalAccount,
        contractType: relation.contractType,
        position: relation.position,
        area: relation.area,
        regional: relation.regional,
        baseLocation: relation.baseLocation,
        startDate: relation.startDate,
        endDate: relation.endDate,
        gender: employee.gender,
        birthDate: employee.birthDate,
        terminationReason: relation.terminationReason,
        terminationCost: relation.terminationCost,
        status: relation.status === 'active' ? 'active' : 'retired',
        isApprentice: isSenaApprentice(relation),
        payroll: payrollSnap.exists() ? payrollSnap.data() : undefined,
      } as CompanyWorkforcePerson;
    }));
  const activePeopleAll = people.filter(item => item.status === 'active');
  const payrollPeople = activePeopleAll.filter((item, index, all) => all.findIndex(value => value.employeeId === item.employeeId) === index);
  const amount = (value: unknown) => Number(value) || 0;
  const allowanceFields = ['transportAllowance', 'operationalAllowance', 'foodAllowance', 'supportAllowance', 'vehicleAllowance', 'toolsAllowance', 'communicationAllowance'] as const;
  const monthlyBaseSalary = payrollPeople.reduce((total, item) => total + amount(item.payroll?.baseSalary), 0);
  const monthlyAllowances = payrollPeople.reduce((total, item) => total + allowanceFields.reduce((sum, field) => sum + amount(item.payroll?.[field]), 0), 0);
  const monthlySalaryKpi = payrollPeople.reduce((total, item) => total + amount(item.payroll?.salaryKpi), 0);
  const projects = projectSnap.docs.map(item => ({ id: item.id, ...item.data() } as Project))
    .filter(item => belongsProjectToCompany(item, companyValue))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return {
    company: companyValue,
    people,
    projects,
    ...computeCompanyMetrics(people.map(item => ({ ...item, isApprentice: !!item.isApprentice })), projects),
    monthlyBaseSalary,
    monthlyAllowances,
    monthlySalaryKpi,
    monthlyPayrollTotal: monthlyBaseSalary + monthlyAllowances + monthlySalaryKpi,
  };
}

export interface CompanyWorkforceOverview {
  activePeople: number;
  activeProjects: number;
  withoutAccess: number;
  incompleteRecords: number;
}

export async function getCompanyWorkforceOverview(): Promise<Record<string, CompanyWorkforceOverview>> {
  const [companiesSnap, employeeSnap, employmentsSnap, projectSnap] = await Promise.all([
    getDocs(collection(db, FIRESTORE_COLLECTIONS.companies)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.employees)),
    getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.projects)),
  ]);
  const companies = companiesSnap.docs.map(item => ({ id: item.id, ...item.data() } as Company));
  const employees = new Map(employeeSnap.docs.map(item => [item.id, item.data() as any]));
  const projects = projectSnap.docs.map(item => item.data() as any);
  const relationsByCompany = new Map<string, MetricsRelation[]>(companies.map(company => [company.id, []]));

  employmentsSnap.docs.forEach(item => {
    const relation = item.data() as any;
    const employeeId = relation.employeeId || item.ref.parent.parent?.id;
    if (!employeeId) return;
    const employee = employees.get(employeeId) ?? {};
    const value: MetricsRelation = {
      employeeId,
      status: relation.status === 'active' ? 'active' : 'retired',
      isApprentice: isSenaApprentice(relation),
      identityUserId: employee.identityUserId,
      projectName: relation.projectName,
      analyticalAccount: relation.analyticalAccount,
      position: relation.position,
      corporateEmail: employee.corporateEmail,
      corporatePhone: employee.corporatePhone,
    };
    companies.forEach(company => { if (belongsToCompany(relation, company)) relationsByCompany.get(company.id)!.push(value); });
  });

  return Object.fromEntries(companies.map(company => {
    const metrics = computeCompanyMetrics(relationsByCompany.get(company.id)!, projects.filter(project => belongsProjectToCompany(project, company)));
    return [company.id, {
      activePeople: metrics.activePeople,
      activeProjects: metrics.activeProjects,
      withoutAccess: metrics.withoutAccess,
      incompleteRecords: metrics.incompleteRecords,
    }];
  }));
}
