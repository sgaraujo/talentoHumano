export type MembershipRole = 'admin' | 'miembro' | 'lider';

export interface CompanyMembership {
  id: string;
  userId: string;
  companyId: string;
  role: MembershipRole;
  joinedAt: Date;
}

export interface ProjectMembership {
  id: string;
  userId: string;
  projectId: string;
  companyId: string;          // desnormalizado para queries rápidos
  role: MembershipRole;
  joinedAt: Date;
}
