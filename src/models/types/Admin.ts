export interface Admin {
  id: string;
  email: string;
  name: string;
  role: 'admin';
  createdAt: Date;
}