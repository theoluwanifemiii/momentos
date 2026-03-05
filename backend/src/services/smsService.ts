import axios from 'axios';

interface SMSParams {
  to: string; // Phone number
  message: string;
  senderId?: string;
}

type SmsProviderResponse = {
  code?: string;
  message?: string;
  message_id?: string;
  [key: string]: unknown;
};

type SmsSendResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  mocked?: boolean;
};

export class SMSService {
  private apiKey: string;
  private baseUrl = 'https://v3.api.termii.com/api';
  private testMode: boolean;
  private defaultSenderId: string;
  private channel: string;
  private notifyUrl?: string;

  constructor() {
    this.apiKey = process.env.TERMII_API_KEY || '';
    this.testMode = this.isTestModeEnabled();
    this.defaultSenderId = (process.env.TERMII_SMS_FROM || 'MomentOS').trim();
    this.channel = (process.env.TERMII_SMS_CHANNEL || 'generic').trim() || 'generic';
    this.notifyUrl = (process.env.TERMII_SMS_NOTIFY_URL || '').trim() || undefined;

    if (!this.apiKey) {
      console.warn('⚠️ TERMII_API_KEY not set. SMS will not work.');
    }
    if (this.testMode) {
      console.warn('⚠️ SMS_TEST_MODE enabled. SMS will be mocked.');
    }
  }

  /**
   * Send SMS via Termii
   */
  async send(params: SMSParams): Promise<SmsSendResult> {
    if (this.testMode) {
      const phone = this.formatPhoneNumber(params.to);
      const messageId = `mock-${Date.now()}`;
      console.log(`✅ [MOCK] SMS sent to ${phone}: ${messageId}`);
      return { success: true, messageId, mocked: true };
    }
    if (!this.apiKey) {
      return { success: false, error: 'TERMII_API_KEY is not configured' };
    }

    try {
      const phone = this.formatPhoneNumber(params.to);
      const from = this.resolveSenderId(params.senderId);

      const payload: Record<string, unknown> = {
        to: phone,
        from,
        sms: params.message,
        type: 'plain',
        channel: this.channel,
        api_key: this.apiKey,
      };
      if (this.notifyUrl) {
        payload.notify_url = this.notifyUrl;
      }

      const response = await axios.post(`${this.baseUrl}/sms/send`, payload);
      const data = (response.data || {}) as SmsProviderResponse;
      const providerCode = `${data.code || ''}`.toLowerCase();
      const providerMessage = `${data.message || ''}`.toLowerCase();
      const providerLooksFailed =
        providerCode.includes('fail') ||
        providerCode.includes('error') ||
        providerCode.includes('invalid') ||
        providerCode.includes('reject') ||
        providerMessage.includes('fail') ||
        providerMessage.includes('error') ||
        providerMessage.includes('invalid') ||
        providerMessage.includes('reject');
      const accepted =
        !providerLooksFailed &&
        (providerCode === 'ok' || providerCode === 'success' || Boolean(data.message_id));

      if (accepted) {
        console.log(`✅ SMS accepted by provider for ${phone}: ${data.message_id || 'no-id'}`);
        return {
          success: true,
          messageId: data.message_id,
        };
      }

      console.error(`❌ SMS failed: ${data.message || JSON.stringify(data)}`);
      return {
        success: false,
        error:
          data.message ||
          (providerCode ? `Provider response code: ${providerCode}` : undefined) ||
          'SMS provider returned an unsuccessful response',
      };
    } catch (error: any) {
      const errorDetail =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.response?.data ||
        error.message;
      console.error('SMS Service Error:', errorDetail);
      return {
        success: false,
        error: typeof errorDetail === 'string' ? errorDetail : 'SMS request failed',
      };
    }
  }

  isInTestMode() {
    return this.testMode;
  }

  /**
   * Format phone number for Termii.
   * Supports E.164-style inputs (+14155552671, +447700900123, +2348012345678)
   * and local numbers with DEFAULT_PHONE_COUNTRY_CODE fallback.
   */
  private formatPhoneNumber(phone: string): string {
    const trimmed = phone.trim();
    if (!trimmed) {
      throw new Error('Phone number is required');
    }
    const defaultCountryCode = (process.env.DEFAULT_PHONE_COUNTRY_CODE || '')
      .replace(/\D/g, '');

    let cleaned = trimmed.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('00')) {
      cleaned = `+${cleaned.slice(2)}`;
    }

    if (cleaned.startsWith('+')) {
      let digits = cleaned.slice(1).replace(/\D/g, '');
      if (!digits) {
        throw new Error('Invalid phone number');
      }
      if (defaultCountryCode && digits.startsWith(`${defaultCountryCode}0`)) {
        digits = `${defaultCountryCode}${digits.slice(defaultCountryCode.length + 1)}`;
      }
      return digits;
    }

    const digits = cleaned.replace(/\D/g, '');
    if (!digits) {
      throw new Error('Invalid phone number');
    }

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

    if (defaultCountryCode && digits.startsWith(`${defaultCountryCode}0`)) {
      return `${defaultCountryCode}${digits.slice(defaultCountryCode.length + 1)}`;
    }

    if (digits.length >= 10 && digits.length <= 15) {
      return digits;
    }

    throw new Error('Phone number must include country code');
  }

  /**
   * Validate phone number format
   */
  static isValidNigerianPhone(phone: string): boolean {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (!cleaned) return false;

    if (cleaned.startsWith('+')) {
      const digits = cleaned.slice(1).replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15;
    }

    const digits = cleaned.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  }

  /**
   * Check account balance
   */
  async getBalance(): Promise<number> {
    if (this.testMode) return 0;
    if (!this.apiKey) return 0;

    try {
      const response = await axios.get(`${this.baseUrl}/get-balance`, {
        params: { api_key: this.apiKey },
      });
      return parseFloat(response.data.balance) || 0;
    } catch (error) {
      console.error('Failed to get Termii balance:', error);
      return 0;
    }
  }

  private isTestModeEnabled() {
    const raw = (process.env.SMS_TEST_MODE || '').toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  private resolveSenderId(candidate?: string) {
    const value = (candidate || '').trim();
    const defaultSender = this.defaultSenderId.slice(0, 11);
    if (value) {
      const normalizedCandidate = value.slice(0, 11);
      if (
        normalizedCandidate.toLowerCase() === 'momentos' &&
        defaultSender &&
        defaultSender.toLowerCase() !== 'momentos'
      ) {
        return defaultSender;
      }
      return normalizedCandidate;
    }
    return defaultSender;
  }
}

export const smsService = new SMSService();
