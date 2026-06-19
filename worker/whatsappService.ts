/**
 * Termii WhatsApp Template API
 *
 * Required env vars:
 *   TERMII_API_KEY            — your Termii API key
 *   TERMII_WHATSAPP_DEVICE_ID — Device ID from Termii dashboard → Manage Devices
 *   TERMII_WHATSAPP_TEMPLATE_ID — pre-approved WhatsApp template ID from Termii
 *
 * Your Termii WhatsApp template should use numbered variable slots:
 *   {{1}} = recipient first name
 *   {{2}} = organisation name
 *   {{3}} = the celebration label (e.g. "birthday", "3rd work anniversary")
 *
 * Example template text:
 *   "Hi {{1}}! 🎉 {{2}} is celebrating your {{3}} with you today. Enjoy your special day!"
 *
 * Optional:
 *   WHATSAPP_TEST_MODE=true   — mock sends without hitting Termii
 */

export interface WhatsAppTemplateParams {
  to: string;
  /** Recipient's first name — maps to slot "1" in the Termii template */
  firstName: string;
  /** Organisation name — maps to slot "2" */
  orgName: string;
  /** Celebration label — maps to slot "3" (e.g. "birthday", "3rd work anniversary") */
  celebrationLabel: string;
  /** Optional media attachment */
  media?: {
    caption: string;
    url: string;
  };
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class WhatsAppService {
  private readonly apiKey: string;
  private readonly deviceId: string;
  private readonly templateId: string;
  private readonly baseUrl = 'https://v3.api.termii.com';
  private readonly testMode: boolean;

  constructor() {
    this.apiKey = process.env.TERMII_API_KEY || '';
    this.deviceId = process.env.TERMII_WHATSAPP_DEVICE_ID || '';
    this.templateId = process.env.TERMII_WHATSAPP_TEMPLATE_ID || '';
    this.testMode = this.isTestModeEnabled();

    if (!this.apiKey) {
      console.warn('⚠️  TERMII_API_KEY not set — WhatsApp sends will fail.');
    }
    if (!this.deviceId) {
      console.warn('⚠️  TERMII_WHATSAPP_DEVICE_ID not set — WhatsApp sends will fail.');
    }
    if (!this.templateId) {
      console.warn('⚠️  TERMII_WHATSAPP_TEMPLATE_ID not set — WhatsApp sends will fail.');
    }
    if (this.testMode) {
      console.warn('⚠️  WHATSAPP_TEST_MODE enabled — WhatsApp sends are mocked.');
    }
  }

  async send(params: WhatsAppTemplateParams): Promise<WhatsAppSendResult> {
    if (this.testMode) {
      const phone = this.formatPhoneNumber(params.to);
      const messageId = `mock-wa-${Date.now()}`;
      console.log(
        `✅ [MOCK] WhatsApp template sent to ${phone} | ` +
          `firstName=${params.firstName} orgName=${params.orgName} celebration=${params.celebrationLabel}`,
      );
      return { success: true, messageId };
    }

    const missingVars: string[] = [];
    if (!this.apiKey) missingVars.push('TERMII_API_KEY');
    if (!this.deviceId) missingVars.push('TERMII_WHATSAPP_DEVICE_ID');
    if (!this.templateId) missingVars.push('TERMII_WHATSAPP_TEMPLATE_ID');
    if (missingVars.length) {
      return { success: false, error: `Missing env vars: ${missingVars.join(', ')}` };
    }

    let phone: string;
    try {
      phone = this.formatPhoneNumber(params.to);
    } catch (err: any) {
      return { success: false, error: err.message };
    }

    const data: Record<string, string> = {
      '1': params.firstName,
      '2': params.orgName,
      '3': params.celebrationLabel,
    };

    const endpoint = params.media
      ? `${this.baseUrl}/api/send/template/media`
      : `${this.baseUrl}/api/send/template`;

    const body: Record<string, unknown> = {
      phone_number: phone,
      device_id: this.deviceId,
      template_id: this.templateId,
      api_key: this.apiKey,
      data,
    };

    if (params.media) {
      body['media'] = {
        caption: params.media.caption,
        url: params.media.url,
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      const json = text ? (JSON.parse(text) as any) : {};

      if (json.code === 'ok') {
        console.log(`✅ WhatsApp template sent to ${phone}: ${json.message_id}`);
        return { success: true, messageId: json.message_id || json.message_id_str };
      }

      const errorMsg =
        json.message ||
        json.error ||
        `Termii responded with status ${response.status}`;
      console.error(`❌ WhatsApp template failed for ${phone}: ${errorMsg}`);
      return { success: false, error: errorMsg };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private formatPhoneNumber(phone: string): string {
    const trimmed = phone.trim();
    if (!trimmed) throw new Error('Phone number is required');

    let cleaned = trimmed.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;

    if (cleaned.startsWith('+')) {
      const digits = cleaned.slice(1).replace(/\D/g, '');
      if (!digits) throw new Error('Invalid phone number');
      return digits;
    }

    const digits = cleaned.replace(/\D/g, '');
    if (!digits) throw new Error('Invalid phone number');

    const defaultCountryCode = (process.env.DEFAULT_PHONE_COUNTRY_CODE || '').replace(/\D/g, '');

    if (digits.startsWith('0')) {
      if (defaultCountryCode) return `${defaultCountryCode}${digits.slice(1)}`;
      if (digits.length === 11) return `234${digits.slice(1)}`;
    }

    if (digits.length === 10) return `${defaultCountryCode || '234'}${digits}`;
    if (digits.length >= 10 && digits.length <= 15) return digits;

    throw new Error('Phone number must include country code');
  }

  private isTestModeEnabled(): boolean {
    const raw = (
      process.env.WHATSAPP_TEST_MODE ||
      process.env.SMS_TEST_MODE ||
      ''
    ).toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }
}

export const whatsappService = new WhatsAppService();
