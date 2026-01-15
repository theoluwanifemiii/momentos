type TemplatePayload = {
  subject: string;
  html: string;
  text: string;
};

export function otpTemplate(params: { code: string; ttlMinutes: number; purpose: 'VERIFY' | 'RESET' }): TemplatePayload {
  const subject =
    params.purpose === 'VERIFY'
      ? 'Verify your MomentOS account'
      : 'Reset your MomentOS password';
  const text = `Your MomentOS one-time code is ${params.code}. It expires in ${params.ttlMinutes} minutes.`;
  const html = `<div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
    <div style="background: #111827; color: #ffffff; padding: 20px 24px;">
      <h1 style="margin: 0; font-size: 20px;">MomentOS</h1>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 12px; font-size: 16px; color: #111827;">Your one-time code</p>
      <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #2563eb; margin-bottom: 12px;">${params.code}</div>
      <p style="margin: 0; color: #6b7280;">This code expires in ${params.ttlMinutes} minutes.</p>
    </div>
  </div>
</div>`;

  return { subject, html, text };
}

export function welcomeTemplate(params: { organizationName: string }): TemplatePayload {
  const subject = 'Welcome to MomentOS';
  const text = `Welcome to MomentOS! Your organization ${params.organizationName} is ready. Check your inbox for the verification code to finish setup.`;
  const html = `<div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden;">
    <div style="background: #111827; color: #ffffff; padding: 20px 24px;">
      <h1 style="margin: 0; font-size: 20px;">Welcome to MomentOS</h1>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 12px; font-size: 16px; color: #111827;">
        Your organization <strong>${params.organizationName}</strong> is ready.
      </p>
      <p style="margin: 0; color: #6b7280;">
        Check your inbox for the verification code to finish setup.
      </p>
    </div>
  </div>
</div>`;

  return { subject, html, text };
}
