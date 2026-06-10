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
  activeTH?: boolean;
  activeContabilidad?: boolean;
  hiddenTaxTypes?: string[];   // tipos de obligación DIAN ocultos para esta empresa
  createdAt: Date;
  updatedAt: Date;
}
