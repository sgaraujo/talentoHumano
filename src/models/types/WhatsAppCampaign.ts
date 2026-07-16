export type WaRecipientSource = "user" | "external";

export interface WaCampaignRecipient {
  id: string;
  name: string;
  phone: string;
  source: WaRecipientSource;
  userId?: string;
  companyId?: string;
  projectId?: string;
  group?: string;
}

export interface WaCampaignDraft {
  name: string;
  numberId: string;
  companyId?: string;
  projectId?: string;
  templateId: string;
  parameterValues: Record<string, string>;
  recipients: WaCampaignRecipient[];
}
