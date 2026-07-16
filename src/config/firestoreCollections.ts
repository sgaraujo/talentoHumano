/**
 * Catálogo único de nombres de colecciones de Firestore usadas por el frontend.
 *
 * Estos valores reflejan las rutas existentes en producción. Cambiar un valor
 * aquí implica una migración de datos y debe hacerse de forma explícita.
 */
export const FIRESTORE_COLLECTIONS = {
  users: 'identity/data/users',
  allowedEmails: 'identity/data/allowed_emails',
  platformRoles: 'identity/data/platform_roles',

  companies: 'organization/data/companies',
  projects: 'organization/data/projects',
  companyMemberships: 'organization/data/company_memberships',
  projectMemberships: 'organization/data/project_memberships',

  questionnaires: 'questionnaires/data/definitions',
  questionnaireAssignments: 'questionnaires/data/assignments',
  questionnaireResponses: 'questionnaires/data/responses',

  communications: 'communications/data/messages',
  communicationRecipients: 'communications/data/recipients',
  bulletins: 'communications/data/bulletins',

  movements: 'human_resources/data/movements',
  employees: 'human_resources/data/employees',
  contractors: 'human_resources/data/contractors',
  apprentices: 'human_resources/data/apprentices',
  incapacities: 'human_resources/data/incapacities',
  correspondence: 'human_resources/data/correspondence',
  humanResourceImportRuns: 'human_resources/data/import_runs',

  taxObligations: 'accounting/data/tax_obligations',
  taxDailyLog: 'accounting/data/tax_daily_activity',
  taxAlertLog: 'accounting/data/tax_alerts',
  taxCalendarEvents: 'accounting/data/tax_calendar_events',
  companyTaxSettings: 'accounting/data/company_tax_settings',
  accountingMessageLog: 'communications/data/accounting_messages',

  whatsappNumbers: 'whatsapp/data/numbers',
  whatsappCampaigns: 'whatsapp/data/campaigns',
  whatsappMessageIndex: 'whatsapp/data/message_index',
} as const;

/** Nombres de subcolecciones. */
export const FIRESTORE_SUBCOLLECTIONS = {
  taxObligationHistory: 'history',
  bulletinViews: 'views',
  whatsappTemplates: 'templates',
  whatsappConversations: 'conversations',
  whatsappMessages: 'messages',
  whatsappProcessedMessages: 'processed',
  whatsappCampaignRecipients: 'recipients',
  employeePrivateData: 'private',
  employeeEmployments: 'employments',
} as const;

export type FirestoreCollectionName =
  typeof FIRESTORE_COLLECTIONS[keyof typeof FIRESTORE_COLLECTIONS];
