export type EmploymentStatus = 'active' | 'retired' | 'inactive' | 'unknown';

export interface EmployeeRecord {
  id: string;
  identityUserId?: string;
  documentType?: string;
  documentNumber: string;
  fullName: string;
  status: EmploymentStatus;
  personalEmail?: string;
  corporateEmail?: string;
  personalPhone?: string;
  corporatePhone?: string;
  birthDate?: string;
  gender?: string;
  nationality?: string;
  residence?: {
    department?: string;
    city?: string;
    address?: string;
  };
  education?: {
    academicLevel?: string;
    profession?: string;
    professionalLicense?: string;
  };
  currentEmploymentIds?: string[];
  source?: {
    system: 'excel' | 'application';
    importRunId?: string;
    sourceRow?: number;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** Una persona puede tener varias relaciones laborales, incluso simultáneas. */
export interface EmploymentRelationship {
  id: string;
  employeeId: string;
  status: EmploymentStatus;
  companyId?: string;
  companyName?: string;
  projectId?: string;
  projectName?: string;
  position?: string;
  supervisor?: string;
  contractType?: string;
  startDate?: string;
  endDate?: string;
  workday?: string;
  modality?: string;
  regional?: string;
  baseLocation?: string;
  area?: string;
  analyticalAccount?: string;
  terminationReason?: string;
  terminationCost?: number;
  sourceRow?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EmployeePayrollRecord {
  salaryType?: string;
  baseSalary?: number;
  transportAllowance?: number;
  operationalAllowance?: number;
  foodAllowance?: number;
  supportAllowance?: number;
  vehicleAllowance?: number;
  toolsAllowance?: number;
  communicationAllowance?: number;
  salaryKpi?: number;
  discountRecord?: string;
}

export interface EmployeeBankingRecord {
  bankName?: string;
  accountType?: string;
  accountNumber?: string;
}

export interface EmployeeSocialSecurityRecord {
  eps?: string;
  afp?: string;
  ccf?: string;
  severanceFund?: string;
  arlRiskLevel?: string;
}

export type EmployeePrivateDocument =
  | EmployeePayrollRecord
  | EmployeeBankingRecord
  | EmployeeSocialSecurityRecord;

export interface HumanResourceImportRun {
  id: string;
  fileName: string;
  fileDate?: string;
  status: 'diagnostic' | 'approved' | 'processing' | 'completed' | 'failed';
  mode: 'preview' | 'apply';
  totals: {
    rows: number;
    valid: number;
    newRecords: number;
    changed: number;
    unchanged: number;
    conflicts: number;
    rejected: number;
  };
  createdBy: string;
  createdAt?: unknown;
  completedAt?: unknown;
}
