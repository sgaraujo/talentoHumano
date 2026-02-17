export interface Company {
  id: string;
  name: string;
  nit: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  regional?: string;
  baseDeOperacion?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
