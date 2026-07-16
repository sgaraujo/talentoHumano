import { collection, collectionGroup, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/config/firestoreCollections';
import type { Company } from '@/models/types/Company';
import type { Project } from '@/models/types/Project';

export interface CompanyWorkforcePerson {
  employeeId: string;
  documentNumber: string;
  fullName: string;
  identityUserId?: string | null;
  corporateEmail?: string;
  corporatePhone?: string;
  companyName: string;
  projectName?: string;
  position?: string;
  area?: string;
  regional?: string;
  baseLocation?: string;
  startDate?: string;
  status: 'active' | 'retired';
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
      const relation = { id: item.id, employeeId: item.data().employeeId || item.ref.parent.parent?.id, ...item.data() } as any;
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
        position: relation.position,
        area: relation.area,
        regional: relation.regional,
        baseLocation: relation.baseLocation,
        startDate: relation.startDate,
        status: relation.status === 'active' ? 'active' : 'retired',
        payroll: payrollSnap.exists() ? payrollSnap.data() : undefined,
      } as CompanyWorkforcePerson;
    }));
  const uniqueActive = new Set(people.filter(item => item.status === 'active').map(item => item.employeeId));
  const uniqueRetired = new Set(people.filter(item => item.status === 'retired').map(item => item.employeeId));
  const activePeople = people.filter(item => item.status === 'active');
  const payrollPeople = activePeople.filter((item, index, all) => all.findIndex(value => value.employeeId === item.employeeId) === index);
  const amount = (value: unknown) => Number(value) || 0;
  const allowanceFields = ['transportAllowance', 'operationalAllowance', 'foodAllowance', 'supportAllowance', 'vehicleAllowance', 'toolsAllowance', 'communicationAllowance'] as const;
  const monthlyBaseSalary = payrollPeople.reduce((total, item) => total + amount(item.payroll?.baseSalary), 0);
  const monthlyAllowances = payrollPeople.reduce((total, item) => total + allowanceFields.reduce((sum, field) => sum + amount(item.payroll?.[field]), 0), 0);
  const monthlySalaryKpi = payrollPeople.reduce((total, item) => total + amount(item.payroll?.salaryKpi), 0);
  const projects = projectSnap.docs.map(item => ({ id: item.id, ...item.data() } as Project))
    .filter(item => item.companyId === companyId || normalize(item.companyName) === normalize(companyValue.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return {
    company: companyValue,
    people,
    projects,
    activePeople: uniqueActive.size,
    retiredPeople: [...uniqueRetired].filter(id => !uniqueActive.has(id)).length,
    withoutAccess: new Set(activePeople.filter(item => !item.identityUserId).map(item => item.employeeId)).size,
    activeProjects: projects.filter(item => item.status === 'activo').length,
    incompleteRecords: activePeople.filter(item => !item.projectName || !item.position || !item.corporateEmail || !item.corporatePhone).length,
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
  const buckets = new Map(companies.map(company => [company.id, {
    active: new Set<string>(), withoutAccess: new Set<string>(), incomplete: new Set<string>(),
  }]));

  employmentsSnap.docs.forEach(item => {
    const relation = item.data() as any;
    if (relation.status !== 'active') return;
    const company = companies.find(value => belongsToCompany(relation, value));
    const employeeId = relation.employeeId || item.ref.parent.parent?.id;
    if (!company || !employeeId) return;
    const bucket = buckets.get(company.id)!;
    bucket.active.add(employeeId);
    const employee = employees.get(employeeId) ?? {};
    if (!employee.identityUserId) bucket.withoutAccess.add(employeeId);
    if (!relation.projectName || !relation.position || !employee.corporateEmail || !employee.corporatePhone) bucket.incomplete.add(employeeId);
  });

  const activeProjectsByCompany = new Map<string, number>();
  projectSnap.docs.forEach(item => {
    const project = item.data() as any;
    if (project.status !== 'activo' || !project.companyId) return;
    activeProjectsByCompany.set(project.companyId, (activeProjectsByCompany.get(project.companyId) ?? 0) + 1);
  });

  return Object.fromEntries(companies.map(company => {
    const bucket = buckets.get(company.id)!;
    return [company.id, {
      activePeople: bucket.active.size,
      activeProjects: activeProjectsByCompany.get(company.id) ?? 0,
      withoutAccess: bucket.withoutAccess.size,
      incompleteRecords: bucket.incomplete.size,
    }];
  }));
}
