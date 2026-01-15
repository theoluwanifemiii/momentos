import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResendClient() {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  resendClient = new Resend(apiKey);
  return resendClient;
}

export interface EmailParams {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from: {
    name: string;
    email: string;
  };
}

export class EmailService {
  static async send(params: EmailParams): Promise<{ id: string; success: boolean }> {
    try {
      const resend = getResendClient();
      const result = await resend.emails.send({
        from: `${params.from.name} <${params.from.email}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text ?? '',
      });

      if (result.error) {
        console.error('Email send error:', result.error);
        throw new Error(result.error.message);
      }

      console.log(`Email sent: ${result.data?.id}`);

      return {
        id: result.data?.id || 'unknown',
        success: true,
      };
    } catch (error: any) {
      console.error('Email service error:', error);
      throw error;
    }
  }
}
