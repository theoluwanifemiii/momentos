interface SMSParams {
  to: string;
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
      const response = await fetch(`${this.baseUrl}/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          from: params.senderId || 'MomentOS',
          sms: params.message,
          type: 'plain',
          channel: 'generic',
          api_key: this.apiKey,
        }),
      });

      const text = await response.text();
      const data = text ? (JSON.parse(text) as any) : {};

      if (data.code === 'ok') {
        console.log(`✅ SMS sent to ${phone}: ${data.message_id}`);
        return {
          success: true,
          messageId: data.message_id,
        };
      }

      console.error(`❌ SMS failed: ${data.message || text || response.status}`);
      return {
        success: false,
        error: data.message || text || `Request failed with status ${response.status}`,
      };
    } catch (error: any) {
      console.error('SMS Service Error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

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

  private isTestModeEnabled() {
    const raw = (process.env.SMS_TEST_MODE || '').toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }
}

export const smsService = new SMSService();
