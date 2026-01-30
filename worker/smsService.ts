interface SMSParams {
  to: string;
  message: string;
  senderId?: string;
}

export class SMSService {
  private apiKey: string;
  private baseUrl = 'https://v3.api.termii.com';

  constructor() {
    this.apiKey = process.env.TERMII_API_KEY || '';

    if (!this.apiKey) {
      console.warn('⚠️ TERMII_API_KEY not set. SMS will not work.');
    }
  }

  async send(params: SMSParams): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
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

      const data = (await response.json()) as any;

      if (data.code === 'ok') {
        console.log(`✅ SMS sent to ${phone}: ${data.message_id}`);
        return {
          success: true,
          messageId: data.message_id,
        };
      }

      console.error(`❌ SMS failed: ${data.message}`);
      return {
        success: false,
        error: data.message,
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
}

export const smsService = new SMSService();
