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
  aliases?: string[];
  modules?: {
    humanResources?: boolean;
    accounting?: boolean;
    communications?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}
