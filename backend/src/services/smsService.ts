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
   * Format phone number to international format
   * Supports: 08012345678, 2348012345678, +2348012345678
   */
  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('0')) {
      cleaned = '234' + cleaned.substring(1);
    } else if (cleaned.startsWith('234')) {
      // already correct
    } else if (cleaned.length === 10) {
      cleaned = '234' + cleaned;
    }

    return cleaned;
  }

  /**
   * Validate phone number format
   */
  static isValidNigerianPhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('0') && cleaned.length === 11) return true;
    if (cleaned.startsWith('234') && cleaned.length === 13) return true;
    if (cleaned.length === 10) return true;

    return false;
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
