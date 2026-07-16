import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  collectionGroup,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'nelyoda-rules-test';
const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: readFileSync('firestore.rules.next', 'utf8'),
  },
});

const users = {
  admin: ['admin@test.local', 'admin'],
  accounting: ['accounting@test.local', 'contabilidad'],
  finance: ['finance@test.local', 'financiera'],
  hr: ['hr@test.local', 'talento_humano'],
};

try {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [email, role] of Object.values(users)) {
      await setDoc(doc(db, 'platform_roles', email), { email, role });
      await setDoc(doc(db, 'identity', 'data', 'platform_roles', email), { email, role });
    }
    await setDoc(doc(db, 'tax_obligations', 'existing'), {
      company: 'Empresa prueba',
      dueDate: '2026-08-01',
      status: 'No iniciado',
    });
    await setDoc(doc(db, 'bulletins', 'public'), { title: 'Público' });
  });

  const context = (key) => {
    const [email] = users[key];
    return testEnv.authenticatedContext(key, { email }).firestore();
  };

  const adminDb = context('admin');
  const accountingDb = context('accounting');
  const financeDb = context('finance');
  const hrDb = context('hr');
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertFails(getDoc(doc(anonymousDb, 'tax_obligations', 'existing')));
  await assertFails(getDoc(doc(hrDb, 'tax_obligations', 'existing')));
  await assertFails(getDoc(doc(accountingDb, 'tax_obligations', 'existing')));
  await assertFails(getDoc(doc(financeDb, 'tax_obligations', 'existing')));

  await assertFails(setDoc(doc(accountingDb, 'tax_obligations', 'new'), {
    company: 'Empresa prueba',
    dueDate: '2026-09-01',
    status: 'No iniciado',
  }));
  await assertFails(setDoc(doc(financeDb, 'tax_obligations', 'finance-created'), {
    company: 'No permitido',
    dueDate: '2026-09-01',
  }));
  await assertFails(updateDoc(doc(financeDb, 'tax_obligations', 'existing'), {
    status: 'Pagado',
  }));

  const canonicalObligation = doc(accountingDb, 'accounting', 'data', 'tax_obligations', 'canonical');
  await assertSucceeds(setDoc(canonicalObligation, {
    company: 'Empresa canónica', taxType: 'IVA', dueDate: '2026-07-20', status: '',
  }));
  await assertSucceeds(getDoc(doc(financeDb, 'accounting', 'data', 'tax_obligations', 'canonical')));
  await assertFails(getDoc(doc(hrDb, 'accounting', 'data', 'tax_obligations', 'canonical')));
  await assertFails(setDoc(doc(financeDb, 'accounting', 'data', 'tax_obligations', 'finance-created'), {
    company: 'No permitida', taxType: 'IVA', dueDate: '2026-07-20', status: '',
  }));
  await assertSucceeds(updateDoc(doc(financeDb, 'accounting', 'data', 'tax_obligations', 'canonical'), {
    status: 'Pagado',
  }));

  const canonicalHistory = doc(accountingDb, 'accounting', 'data', 'tax_obligations', 'canonical', 'history', 'event-1');
  await assertSucceeds(setDoc(canonicalHistory, { status: 'Revisado' }));
  await assertFails(updateDoc(canonicalHistory, { status: 'Pagado' }));

  const canonicalCompany = doc(adminDb, 'organization', 'data', 'companies', 'company-1');
  await assertSucceeds(setDoc(canonicalCompany, { name: 'Empresa', nit: '900123456' }));
  await assertSucceeds(getDoc(doc(hrDb, 'organization', 'data', 'companies', 'company-1')));
  await assertSucceeds(getDoc(doc(accountingDb, 'organization', 'data', 'companies', 'company-1')));
  await assertSucceeds(updateDoc(doc(hrDb, 'organization', 'data', 'companies', 'company-1'), { activeTH: true }));
  await assertFails(updateDoc(doc(accountingDb, 'organization', 'data', 'companies', 'company-1'), { name: 'No permitido' }));
  await assertFails(getDoc(doc(anonymousDb, 'organization', 'data', 'companies', 'company-1')));

  const canonicalMembership = doc(hrDb, 'organization', 'data', 'company_memberships', 'membership-1');
  await assertSucceeds(setDoc(canonicalMembership, { userId: 'hr', companyId: 'company-1', role: 'miembro' }));

  const taxSettings = doc(accountingDb, 'accounting', 'data', 'company_tax_settings', 'company-1');
  await assertSucceeds(setDoc(taxSettings, { companyId: 'company-1', excludedTaxTypes: ['IVA'] }));
  await assertSucceeds(getDoc(doc(financeDb, 'accounting', 'data', 'company_tax_settings', 'company-1')));
  await assertFails(setDoc(doc(financeDb, 'accounting', 'data', 'company_tax_settings', 'company-2'), {
    companyId: 'company-2', excludedTaxTypes: [],
  }));
  await assertFails(getDoc(doc(hrDb, 'accounting', 'data', 'company_tax_settings', 'company-1')));

  const questionnaire = doc(hrDb, 'questionnaires', 'data', 'definitions', 'questionnaire-1');
  await assertSucceeds(setDoc(questionnaire, { title: 'Formulario', active: true }));
  await assertSucceeds(getDoc(questionnaire));
  await assertFails(getDoc(doc(anonymousDb, 'questionnaires', 'data', 'definitions', 'questionnaire-1')));

  const assignment = doc(hrDb, 'questionnaires', 'data', 'assignments', 'assignment-1');
  await assertSucceeds(setDoc(assignment, { questionnaireId: 'questionnaire-1', userId: 'hr', status: 'pending' }));

  const movement = doc(hrDb, 'human_resources', 'data', 'movements', 'movement-1');
  await assertSucceeds(setDoc(movement, {
    type: 'ingreso', userId: 'hr', date: new Date(), createdBy: 'hr',
  }));
  await assertSucceeds(getDoc(doc(adminDb, 'human_resources', 'data', 'movements', 'movement-1')));
  await assertFails(getDoc(doc(accountingDb, 'human_resources', 'data', 'movements', 'movement-1')));
  await assertFails(getDoc(doc(anonymousDb, 'human_resources', 'data', 'movements', 'movement-1')));

  const employee = doc(hrDb, 'human_resources', 'data', 'employees', 'employee-1');
  await assertSucceeds(setDoc(employee, {
    documentNumber: 'test-document', fullName: 'Persona prueba', status: 'active',
  }));
  await assertSucceeds(getDoc(doc(adminDb, 'human_resources', 'data', 'employees', 'employee-1')));
  await assertFails(getDoc(doc(accountingDb, 'human_resources', 'data', 'employees', 'employee-1')));
  await assertFails(getDoc(doc(financeDb, 'human_resources', 'data', 'employees', 'employee-1')));
  await assertFails(getDoc(doc(anonymousDb, 'human_resources', 'data', 'employees', 'employee-1')));

  const payroll = doc(hrDb, 'human_resources', 'data', 'employees', 'employee-1', 'private', 'payroll');
  await assertSucceeds(setDoc(payroll, { baseSalary: 1000000 }));
  await assertSucceeds(getDoc(doc(adminDb, 'human_resources', 'data', 'employees', 'employee-1', 'private', 'payroll')));
  await assertFails(getDoc(doc(accountingDb, 'human_resources', 'data', 'employees', 'employee-1', 'private', 'payroll')));

  const employment = doc(hrDb, 'human_resources', 'data', 'employees', 'employee-1', 'employments', 'employment-1');
  await assertSucceeds(setDoc(employment, { companyName: 'Empresa', status: 'active' }));
  await assertSucceeds(getDoc(doc(adminDb, 'human_resources', 'data', 'employees', 'employee-1', 'employments', 'employment-1')));
  await assertFails(getDoc(doc(financeDb, 'human_resources', 'data', 'employees', 'employee-1', 'employments', 'employment-1')));
  await assertSucceeds(getDocs(collectionGroup(hrDb, 'employments')));
  await assertSucceeds(getDocs(collectionGroup(adminDb, 'employments')));
  await assertFails(getDocs(collectionGroup(financeDb, 'employments')));
  await assertFails(getDocs(collectionGroup(accountingDb, 'employments')));

  const employeeAudit = doc(hrDb, 'human_resources', 'data', 'employees', 'employee-1', 'audit', 'change-1');
  await assertSucceeds(setDoc(employeeAudit, { field: 'personalPhone', changedBy: users.hr[0] }));
  await assertFails(updateDoc(employeeAudit, { field: 'corporatePhone' }));
  await assertFails(getDoc(doc(accountingDb, 'human_resources', 'data', 'employees', 'employee-1', 'audit', 'change-1')));

  const incapacity = doc(hrDb, 'human_resources', 'data', 'incapacities', 'case-1');
  await assertSucceeds(setDoc(incapacity, { employeeId: 'employee-1', status: 'open' }));
  await assertFails(getDoc(doc(financeDb, 'human_resources', 'data', 'incapacities', 'case-1')));

  const importRun = doc(hrDb, 'human_resources', 'data', 'import_runs', 'run-1');
  await assertSucceeds(setDoc(importRun, { fileName: 'test.xlsx', status: 'diagnostic' }));
  await assertFails(getDoc(doc(accountingDb, 'human_resources', 'data', 'import_runs', 'run-1')));

  const canonicalUser = doc(hrDb, 'identity', 'data', 'users', 'hr-user');
  await assertFails(setDoc(canonicalUser, { email: users.hr[0], fullName: 'Talento Humano' }));
  await assertSucceeds(setDoc(doc(adminDb, 'identity', 'data', 'users', 'admin-user'), { email: users.admin[0], fullName: 'Administrador' }));
  await assertSucceeds(getDoc(doc(hrDb, 'identity', 'data', 'users', 'admin-user')));
  await assertFails(getDoc(doc(accountingDb, 'identity', 'data', 'users', 'admin-user')));
  await assertFails(getDoc(doc(anonymousDb, 'identity', 'data', 'users', 'hr-user')));

  const whatsappNumber = doc(adminDb, 'whatsapp', 'data', 'numbers', 'number-1');
  await assertSucceeds(setDoc(whatsappNumber, { displayName: 'Línea principal' }));
  await assertSucceeds(setDoc(doc(adminDb, 'whatsapp', 'data', 'numbers', 'number-1', 'templates', 'template-1'), {
    displayName: 'Bienvenida',
  }));
  await assertFails(getDoc(doc(anonymousDb, 'whatsapp', 'data', 'numbers', 'number-1')));
  await assertFails(setDoc(doc(adminDb, 'whatsapp', 'data', 'message_index', 'provider-1'), { campaignId: 'one' }));

  const historyRef = doc(accountingDb, 'tax_obligations', 'existing', 'history', 'event-1');
  await assertFails(setDoc(historyRef, {
    status: 'Revisado',
    changedBy: 'Contabilidad',
  }));
  await assertFails(updateDoc(historyRef, { status: 'Pagado' }));

  await assertFails(setDoc(doc(adminDb, 'platform_roles', 'new@test.local'), {
    email: 'new@test.local',
    role: 'contabilidad',
  }));
  await assertFails(setDoc(doc(accountingDb, 'platform_roles', 'other@test.local'), {
    email: 'other@test.local',
    role: 'admin',
  }));
  await assertSucceeds(setDoc(doc(adminDb, 'identity', 'data', 'platform_roles', 'canonical@test.local'), {
    email: 'canonical@test.local', role: 'contabilidad',
  }));
  await assertFails(setDoc(doc(accountingDb, 'identity', 'data', 'platform_roles', 'forbidden@test.local'), {
    email: 'forbidden@test.local', role: 'admin',
  }));
  await assertFails(getDoc(doc(anonymousDb, 'identity', 'data', 'platform_roles', users.admin[0])));

  await assertFails(getDoc(doc(anonymousDb, 'bulletins', 'public')));
  await assertFails(setDoc(doc(anonymousDb, 'bulletins', 'public', 'views', 'view-1'), {
    viewedAt: new Date(),
  }));
  await assertSucceeds(getDoc(doc(anonymousDb, 'communications', 'data', 'bulletins', 'public')));
  await assertSucceeds(setDoc(doc(anonymousDb, 'communications', 'data', 'bulletins', 'public', 'views', 'view-2'), {
    viewedAt: new Date(),
  }));
  await assertFails(getDoc(doc(anonymousDb, 'users', 'someone')));
  await assertFails(setDoc(doc(adminDb, 'unknown_collection', 'doc'), { value: true }));

  console.log('OK: reglas verificadas para admin, contabilidad, financiera, TH y anónimo.');
} finally {
  await testEnv.cleanup();
}
