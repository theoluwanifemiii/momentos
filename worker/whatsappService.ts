interface WhatsAppParams {
  to: string;
  message: string;
  from?: string;
}

export class WhatsAppService {
  private apiKey: string;
  private baseUrl = 'https://v3.api.termii.com/api';
  private testMode: boolean;

  constructor() {
    this.apiKey = process.env.TERMII_API_KEY || '';
    this.testMode = this.isTestModeEnabled();

    if (!this.apiKey) {
      console.warn('⚠️ TERMII_API_KEY not set. WhatsApp will not work.');
    }
    if (this.testMode) {
      console.warn('⚠️ WHATSAPP_TEST_MODE enabled. WhatsApp will be mocked.');
    }
  }

  async send(params: WhatsAppParams): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (this.testMode) {
      const phone = this.formatPhoneNumber(params.to);
      const messageId = `mock-whatsapp-${Date.now()}`;
      console.log(`✅ [MOCK] WhatsApp sent to ${phone}: ${messageId}`);
      return { success: true, messageId };
    }
    if (!this.apiKey) {
      return { success: false, error: 'TERMII_API_KEY is not configured' };
    }

    try {
      const phone = this.formatPhoneNumber(params.to);
      const response = await fetch(`${this.baseUrl}/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          from: params.from || process.env.TERMII_WHATSAPP_FROM || 'MomentOS',
          sms: params.message,
          type: 'plain',
          channel: 'whatsapp',
          api_key: this.apiKey,
        }),
      });

      const text = await response.text();
      const data = text ? (JSON.parse(text) as any) : {};

      if (data.code === 'ok') {
        console.log(`✅ WhatsApp sent to ${phone}: ${data.message_id}`);
        return {
          success: true,
          messageId: data.message_id,
        };
      }

      return {
        success: false,
        error: data.message || text || `Request failed with status ${response.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private formatPhoneNumber(phone: string): string {
    const trimmed = phone.trim();
    if (!trimmed) {
      throw new Error('Phone number is required');
    }

    let cleaned = trimmed.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('00')) {
      cleaned = `+${cleaned.slice(2)}`;
    }

    if (cleaned.startsWith('+')) {
      const digits = cleaned.slice(1).replace(/\D/g, '');
      if (!digits) {
        throw new Error('Invalid phone number');
      }
      return digits;
    }

    const digits = cleaned.replace(/\D/g, '');
    if (!digits) {
      throw new Error('Invalid phone number');
    }

    const defaultCountryCode = (process.env.DEFAULT_PHONE_COUNTRY_CODE || '')
      .replace(/\D/g, '');

    if (digits.startsWith('0')) {
      if (defaultCountryCode) {
        return `${defaultCountryCode}${digits.slice(1)}`;
      }
      if (digits.length === 11) {
        return `234${digits.slice(1)}`;
      }
    }

    if (digits.length === 10) {
      return `${defaultCountryCode || '234'}${digits}`;
    }

    if (digits.length >= 10 && digits.length <= 15) {
      return digits;
    }

    throw new Error('Phone number must include country code');
  }

  private isTestModeEnabled() {
    const raw = (
      process.env.WHATSAPP_TEST_MODE ||
      process.env.SMS_TEST_MODE ||
      ''
    ).toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }
}

export const whatsappService = new WhatsAppService();
