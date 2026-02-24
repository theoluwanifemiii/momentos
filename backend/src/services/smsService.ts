import axios from 'axios';

interface SMSParams {
  to: string; // Phone number
  message: string;
  senderId?: string;
}

export class SMSService {
  private apiKey: string;
  private baseUrl = 'https://v3.api.termii.com/api';
  private testMode: boolean;

  constructor() {
    this.apiKey = process.env.TERMII_API_KEY || '';
    this.testMode = this.isTestModeEnabled();

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
  async send(params: SMSParams): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (this.testMode) {
      const phone = this.formatPhoneNumber(params.to);
      const messageId = `mock-${Date.now()}`;
      console.log(`✅ [MOCK] SMS sent to ${phone}: ${messageId}`);
      return { success: true, messageId };
    }
    if (!this.apiKey) {
      return { success: false, error: 'TERMII_API_KEY is not configured' };
    }

    try {
      const phone = this.formatPhoneNumber(params.to);

      const response = await axios.post(`${this.baseUrl}/sms/send`, {
        to: phone,
        from: params.senderId || 'MomentOS',
        sms: params.message,
        type: 'plain',
        channel: 'generic',
        api_key: this.apiKey,
      });

      if (response.data.code === 'ok') {
        console.log(`✅ SMS sent to ${phone}: ${response.data.message_id}`);
        return {
          success: true,
          messageId: response.data.message_id,
        };
      }

      console.error(`❌ SMS failed: ${response.data.message}`);
      return {
        success: false,
        error: response.data.message,
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
}

export const smsService = new SMSService();
