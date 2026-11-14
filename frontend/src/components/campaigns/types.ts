export type Channel = 'email' | 'sms' | 'whatsapp';

export type RecurrenceRule =
  | 'ONE_TIME'
  | 'DAILY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'BI_YEARLY'
  | 'ANNUAL'
  | 'CUSTOM';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  ONE_TIME: 'Once',
  DAILY: 'Every day',
  MONTHLY: 'Every month',
  QUARTERLY: 'Every 3 months',
  BI_YEARLY: 'Every 6 months',
  ANNUAL: 'Every year',
  CUSTOM: 'Custom interval',
};

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
};

export type SmsInfo = {
  encoding: 'GSM_7BIT' | 'UCS2';
  length: number;
  segments: number;
  capacity: number;
  remaining: number;
  unsupportedCharacters: string[];
};

export type Campaign = {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  smsText: string | null;
  replyTo: string | null;
  deliveryChannels: Channel[];
  recurrenceRule: RecurrenceRule;
  customIntervalDays: number | null;
  startDate: string;
  endDate: string | null;
  sendHour: number;
  sendMinute: number;
  status: CampaignStatus;
  lastRunAt: string | null;
  lastRunDate: string | null;
  runCount: number;
  timezone: string;
  template: { id: string; name: string; subject?: string; type?: string } | null;
  campaignTemplate: { id: string; name: string; subject: string | null; content: string } | null;
  contactCount: number;
  sms: SmsInfo | null;
  nextRuns: string[];
  createdAt: string;
  updatedAt: string;
};

export type CampaignContact = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  optedOut: boolean;
};

export type CampaignDelivery = {
  id: string;
  channel: Channel;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'OPTED_OUT';
  runDate: string;
  sentAt: string | null;
  errorMessage: string | null;
  segments: number | null;
  createdAt: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
};

/** A campaign-owned design. Always carries a {{body}} slot. */
export type CampaignTemplateOption = {
  id: string;
  name: string;
  subject: string | null;
  content: string;
  isSystem: boolean;
};

export type TemplateOption = {
  id: string;
  name: string;
  channels?: Channel[];
  /** Carried so the editor can preview and detect a {{body}} slot. */
  subject?: string | null;
  type?: string | null;
  content?: string | null;
};
