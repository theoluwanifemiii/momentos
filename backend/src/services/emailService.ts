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
  cc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from: {
    name: string;
    email: string;
  };
  replyTo?: string;
}

const extractEmailErrorMessage = (error: unknown): string => {
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;

  const asAny = error as any;
  const responseMessage =
    asAny?.response?.data?.message ||
    asAny?.response?.data?.error ||
    asAny?.response?.statusText;
  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage;
  }

  const nestedMessage =
    asAny?.error?.message ||
    asAny?.message ||
    asAny?.name;
  if (typeof nestedMessage === "string" && nestedMessage.trim()) {
    return nestedMessage;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown email provider error";
  }
};

export class EmailService {
  static async send(params: EmailParams): Promise<{ id: string; success: boolean }> {
    try {
      const resend = getResendClient();
      const result = await resend.emails.send({
        from: `${params.from.name} <${params.from.email}>`,
        to: params.to,
        cc: params.cc,
        subject: params.subject,
        html: params.html,
        text: params.text ?? '',
        reply_to: params.replyTo,
      });

      if (result.error) {
        console.error('Email send error:', result.error);
        throw new Error(
          `EMAIL_SERVICE_ERROR: ${result.error.message || "Unknown resend error"}`
        );
      }

      console.log(`Email sent: ${result.data?.id}`);

      return {
        id: result.data?.id || 'unknown',
        success: true,
      };
    } catch (error: any) {
      const message = extractEmailErrorMessage(error);
      console.error('Email service error:', message);
      throw new Error(`EMAIL_SERVICE_ERROR: ${message}`);
    }
  }
}
