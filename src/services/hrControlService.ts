import { collection, collectionGroup, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { FIRESTORE_COLLECTIONS, FIRESTORE_SUBCOLLECTIONS } from '@/config/firestoreCollections';
import { parseFirestoreDate } from '@/domain/humanResources/firestoreDate';

export interface HrControlEmployee {
  id: string;
  documentNumber: string;
  fullName: string;
  status: string;
  corporateEmail?: string;
  personalEmail?: string;
  identityUserId?: string | null;
  activeRelations: number;
  retiredRelations: number;
  companies: string[];
  projects: string[];
}

export interface HrImportRunSummary {
  id: string;
  fileName?: string;
  status?: string;
  createdBy?: string;
  createdAt?: any;
  completedAt?: any;
  employeeCount?: number;
  relationshipCount?: number;
  writeCount?: number;
}

export async function getHrControlData() {
  const [employeeSnap, employmentSnap, runSnap] = await Promise.all([
    getDocs(collection(db, FIRESTORE_COLLECTIONS.employees)),
    getDocs(collectionGroup(db, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.humanResourceImportRuns)),
  ]);

  const relations = new Map<string, any[]>();
  employmentSnap.docs.forEach(snapshot => {
    const value = { id: snapshot.id, ...snapshot.data() } as any;
    const employeeId = value.employeeId || snapshot.ref.parent.parent?.id;
    if (!employeeId) return;
    if (!relations.has(employeeId)) relations.set(employeeId, []);
    relations.get(employeeId)!.push(value);
  });

  const employees: HrControlEmployee[] = employeeSnap.docs.map(snapshot => {
    const value = snapshot.data() as any;
    const employeeRelations = relations.get(snapshot.id) ?? [];
    const unique = (field: string) => [...new Set(employeeRelations.map(item => item[field]).filter(Boolean) as string[])];
    return {
      id: snapshot.id,
      documentNumber: value.documentNumber || snapshot.id,
      fullName: value.fullName || 'Sin nombre',
      status: value.status || 'unknown',
      corporateEmail: value.corporateEmail,
      personalEmail: value.personalEmail,
      identityUserId: value.identityUserId,
      activeRelations: employeeRelations.filter(item => item.status === 'active').length,
      retiredRelations: employeeRelations.filter(item => item.status === 'retired').length,
      companies: unique('companyName'),
      projects: unique('projectName'),
    };
  });

  const runs = runSnap.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() } as HrImportRunSummary))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  return { employees, runs };
}

export async function getHrEmployeeDetail(employeeId: string) {
  const employeeRef = doc(db, FIRESTORE_COLLECTIONS.employees, employeeId);
  const [employeeSnap, relationsSnap, bankingSnap, socialSnap] = await Promise.all([
    getDoc(employeeRef),
    getDocs(collection(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeeEmployments)),
    getDoc(doc(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeePrivateData, 'banking')),
    getDoc(doc(employeeRef, FIRESTORE_SUBCOLLECTIONS.employeePrivateData, 'social_security')),
  ]);
  if (!employeeSnap.exists()) throw new Error('El expediente ya no existe.');
  const relationships = await Promise.all(relationsSnap.docs.map(async relationshipSnap => {
    const payrollSnap = await getDoc(doc(
      relationshipSnap.ref,
      FIRESTORE_SUBCOLLECTIONS.employeePrivateData,
      'payroll',
    ));
    return {
      id: relationshipSnap.id,
      ...relationshipSnap.data(),
      payroll: payrollSnap.exists() ? payrollSnap.data() : null,
    };
  }));
  return {
    id: employeeSnap.id,
    ...employeeSnap.data(),
    banking: bankingSnap.exists() ? bankingSnap.data() : null,
    socialSecurity: socialSnap.exists() ? socialSnap.data() : null,
    relationships: relationships.sort((a: any, b: any) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return (parseFirestoreDate(b.startDate)?.getTime() ?? 0) - (parseFirestoreDate(a.startDate)?.getTime() ?? 0);
    }),
  } as any;
}
