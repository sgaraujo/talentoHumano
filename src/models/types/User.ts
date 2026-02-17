export type UserRole = 'colaborador' | 'excolaborador' | 'aspirante' | 'descartado';

export interface User {
  id: string;
  role: UserRole;
  email: string;
  fullName: string;
  profileCompleted: boolean;
  completedOnboardings: string[];
  companyIds?: string[];     // IDs de empresas a las que pertenece
  projectIds?: string[];     // IDs de proyectos asignados
  createdAt: Date;
  updatedAt: Date;
  
  // Hacer opcionales los datos completos
  personalData?: PersonalData;
  demographicData?: DemographicData;
  preferences?: Preferences;
  family?: FamilyData;
  location?: LocationData;
  professionalProfile?: ProfessionalProfile;
  contractInfo?: ContractInfo;
  salaryInfo?: SalaryInfo;
  socialSecurity?: SocialSecurity;
  bankingInfo?: BankingInfo;
  administrativeRecord?: AdministrativeRecord;
}

// ========== DATOS PERSONALES ==========
export interface PersonalData {
  documentType?: string;
  documentNumber?: string;
  fullName?: string;
  gender?: string;
  birthDate?: Date;
  age?: number;
  ageRange?: string;
  bloodType?: string;
  maritalStatus?: string;
  nationality?: string;
  position?: string;
  phone?: string;
}

// ========== DATOS SOCIODEMOGRÁFICOS ==========
export interface DemographicData {
  genderIdentity?: string;
  sexualOrientation?: string;
  community?: string;
  ethnicity?: string;
  protectedPopulation?: string;
  disability?: string;
  socioeconomicLevel?: number;
  commuteTime?: string;
}

// ========== GUSTOS Y MOTIVACIONES ==========
export interface Preferences {
  salaryExpectation?: number;
  upcomingEvents?: string[];
  personalGoals?: string[];
  hobbies?: string[];
  musicalTastes?: string[];
  favoriteSports?: string[];
  preferredBenefits?: string[];
  workModality?: 'presencial' | 'remoto' | 'híbrido';
  
  lifestyle?: {
    diet?: string;
    waterIntake?: string;
    sleepHours?: number;
    familyTime?: string;
    friendsTime?: string;
    hobbyTime?: string;
    trainingTime?: string;
  };
}

// ========== FAMILIA Y HOGAR ==========
export interface FamilyData {
  familyType?: string;
  livesWith?: string[];
  caregiverResponsibilities?: string;
  numberOfCohabitants?: number;
  numberOfChildren?: number;
  children?: Child[];
  financialContribution?: string;
  hasPets?: boolean;
  pets?: Pet[];
}

export interface Child {
  id: string;
  name: string;
  genderIdentity: string;
  birthDate: Date;
  age: number;
}

export interface Pet {
  id: string;
  name: string;
  type: string;
}

// ========== UBICACIÓN Y CONTACTO ==========
export interface LocationData {
  country?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  address?: string;
  department?: string;
  personalEmail?: string;
  corporateEmail?: string;
  corporatePhone?: string;
  linkedInProfile?: string;
  
  emergencyContact?: EmergencyContact;
}

export interface EmergencyContact {
  fullName: string;
  relationship: string;
  phone: string;
}

// ========== PERFIL PROFESIONAL ==========
export interface ProfessionalProfile {
  knowledgeArea?: string;
  academicLevel?: string;
  educationStatus?: string;
  degree?: string;
  currentSemester?: number;
  educationalInstitution?: string;
  undergraduate?: string;
  university?: string;
  programs?: string[];
  
  courses?: Course[];
  languages?: Language[];
  
  experience?: {
    yearsOfExperience?: number;
    mostRecentExperience?: string;
    mostRecentSector?: string;
    lastCompany?: string;
    experienceArea?: string;
    lastPosition?: string;
  };
}

export interface Course {
  id: string;
  name: string;
  institution: string;
  completionDate?: Date;
}

export interface Language {
  id: string;
  language: string;
  level: 'básico' | 'intermedio' | 'avanzado' | 'nativo';
}

// ========== INFORMACIÓN DE CONTRATO (Solo para colaboradores) ==========
export interface ContractInfo {
  contract?: {
    entryType?: string;
    linkType?: string;
    contractType?: string;
    startDate?: Date;
    endDate?: Date;
    probationPeriod?: string;
    entryJustification?: string;
  };
  
  workConditions?: {
    workModality?: 'presencial' | 'remoto' | 'híbrido';
    workday?: string;
    workDays?: string[];
    schedule?: string;
    baseSalary?: number;
    nonConstitutiveAmount?: number;
    productiveStartDate?: Date;
    productiveEndDate?: Date;
  };
  
  assignment?: {
    company?: string;
    location?: string;
    area?: string;
    costCenter?: string;
    directSupervisor?: string;
    position?: string;
    project?: string;
    analyticalAccount?: string;
    accountingProfile?: string;
    profile?: string;
    clientApplicationStatus?: string;
  };
}

// ========== INFORMACIÓN SALARIAL ==========
export interface SalaryInfo {
  salaryType?: string;
  baseSalary?: number;
  transportAllowance?: number;
  foodAllowance?: number;
  vehicleAllowance?: number;
  toolsAllowance?: number;
  communicationAllowance?: number;
  salaryKpi?: number;
  discountRecord?: string;
}

// ========== SEGURIDAD SOCIAL ==========
export interface SocialSecurity {
  eps?: string;
  afp?: string;
  ccf?: string;
  severanceFund?: string;
  arlRiskLevel?: string;
}

// ========== INFORMACIÓN BANCARIA ==========
export interface BankingInfo {
  bankName?: string;
  accountType?: string;
  accountNumber?: string;
}

// ========== REGISTRO ADMINISTRATIVO ==========
export interface AdministrativeRecord {
  entryJustification?: string;
  terminationDate?: Date;
  terminationReason?: string;
  terminationJustification?: string;
  folderCompliance?: boolean;
  disciplinaryActions?: number;
  isMother?: boolean;
  isPregnant?: boolean;
  lifeInsuranceStatus?: string;
}

export interface UserSummary {
  id: string;
  name: string;
  documentNumber: string;
  position?: string;
  role: UserRole;
  email: string;
}