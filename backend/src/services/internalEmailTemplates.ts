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
  const subject = 'Welcome to MomentOS 👋';
  const previewText = 'Thanks for being here. We’re glad you found us.';
  const text = `Hi there,

Welcome to MomentOS — we’re really glad you’re here.

MomentOS was built around a simple belief: people matter, and the systems we use should respect that. Birthdays shouldn’t be forgotten. Messages shouldn’t feel rushed or awkward. And caring shouldn’t require extra work.

You’re now part of a growing group of teams who want moments to feel intentional, not manual.

Here’s what you can do next:

Add your first people (CSV upload or manual entry)
Preview birthday messages before anything goes live
Set your preferred send time and timezone
Relax — we’ll handle the rest

As we keep building, you may hear directly from me with updates or quick questions. Your feedback helps shape MomentOS into something truly useful.

No spam. No noise. Just thoughtful updates.

Thanks for trusting us with your moments.
We’ll take good care of them.

Warmly,
Olu
Founder, MomentOS 💛`;
  const html = `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${previewText}</div>
<div style="font-family: 'Inter', Arial, sans-serif; background: #f8fafc; padding: 32px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);">
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #4f46e5 100%); color: #ffffff; padding: 28px 32px;">
      <div style="font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.8;">MomentOS</div>
      <h1 style="margin: 12px 0 0; font-size: 26px; font-weight: 600;">Welcome to MomentOS</h1>
    </div>
    <div style="padding: 28px 32px; color: #0f172a;">
      <p style="margin: 0 0 12px; font-size: 16px;">Hi there,</p>
      <p style="margin: 0 0 16px; font-size: 17px;">Welcome to MomentOS — we’re really glad you’re here.</p>
      <p style="margin: 0 0 16px; color: #475569;">
        MomentOS was built around a simple belief: people matter, and the systems we use should respect that. Birthdays shouldn’t be forgotten. Messages shouldn’t feel rushed or awkward. And caring shouldn’t require extra work.
      </p>
      <p style="margin: 0 0 16px; color: #475569;">
        You’re now part of a growing group of teams who want moments to feel intentional, not manual.
      </p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px 18px; margin-bottom: 18px;">
        <p style="margin: 0 0 12px; font-weight: 600; color: #0f172a;">Here’s what you can do next:</p>
        <ul style="margin: 0; padding-left: 18px; color: #475569;">
          <li>Add your first people (CSV upload or manual entry)</li>
          <li>Preview birthday messages before anything goes live</li>
          <li>Set your preferred send time and timezone</li>
          <li>Relax — we’ll handle the rest</li>
        </ul>
      </div>
      <p style="margin: 0 0 16px; color: #475569;">
        As we keep building, you may hear directly from me with updates or quick questions. Your feedback helps shape MomentOS into something truly useful.
      </p>
      <p style="margin: 0 0 16px; color: #475569;">No spam. No noise. Just thoughtful updates.</p>
      <p style="margin: 0 0 20px; color: #475569;">
        Thanks for trusting us with your moments. We’ll take good care of them.
      </p>
      <p style="margin: 0; font-weight: 600;">Warmly,<br />Olu</p>
      <p style="margin: 0; color: #64748b;">Founder, MomentOS 💛</p>
    </div>
  </div>
</div>`;

  return { subject, html, text };
}

export function waitlistWelcomeTemplate(): TemplatePayload {
  const subject = 'You’re on the list 🎉';
  const previewText = 'Thanks for joining the waitlist. We’ll be in touch.';
  const text = `Hey — I’m Olu, the person building MomentOS.

MomentOS started from a very simple problem: people care, but systems fail. Birthdays get forgotten not because teams don’t value people, but because the tools we use aren’t built for moments like this.

I’m building MomentOS to be calm, reliable, and human. Something you can set up once and trust. No chasing designers. No awkward late messages. Just consistency.

By joining the waitlist, you’re early — and that matters. You’re helping shape MomentOS from the very beginning.

What happens next?

We’ll email you when early access opens
You’ll get first dibs on new features and updates
I may reach out for feedback as we refine the product

No spam. No noise. Just meaningful updates.

If you have ideas, edge cases, or problems you’d love MomentOS to solve, I’d genuinely love to hear from you.

Thanks for trusting us with your moments.
We’ll take good care of it.

— Olu
Founder, MomentOS 💛`;
  const html = `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${previewText}</div>
<div style="font-family: 'Inter', Arial, sans-serif; background: #f8fafc; padding: 32px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);">
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #4f46e5 100%); color: #ffffff; padding: 28px 32px;">
      <div style="font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.8;">MomentOS</div>
      <h1 style="margin: 12px 0 0; font-size: 26px; font-weight: 600;">Welcome to MomentOS</h1>
    </div>
    <div style="padding: 28px 32px; color: #0f172a;">
      <p style="margin: 0 0 12px; font-size: 16px;">Hey — I’m Olu, the person building MomentOS.</p>
      <p style="margin: 0 0 16px; color: #475569;">
        MomentOS started from a very simple problem: people care, but systems fail. Birthdays get forgotten not because teams don’t value people, but because the tools we use aren’t built for moments like this.
      </p>
      <p style="margin: 0 0 16px; color: #475569;">
        I’m building MomentOS to be calm, reliable, and human. Something you can set up once and trust. No chasing designers. No awkward late messages. Just consistency.
      </p>
      <p style="margin: 0 0 16px; color: #475569;">
        By joining the waitlist, you’re early — and that matters. You’re helping shape MomentOS from the very beginning.
      </p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px 18px; margin-bottom: 18px;">
        <p style="margin: 0 0 12px; font-weight: 600; color: #0f172a;">What happens next?</p>
        <ul style="margin: 0; padding-left: 18px; color: #475569;">
          <li>We’ll email you when early access opens</li>
          <li>You’ll get first dibs on new features and updates</li>
          <li>I may reach out for feedback as we refine the product</li>
        </ul>
      </div>
      <p style="margin: 0 0 16px; color: #475569;">No spam. No noise. Just meaningful updates.</p>
      <p style="margin: 0 0 16px; color: #475569;">
        If you have ideas, edge cases, or problems you’d love MomentOS to solve, I’d genuinely love to hear from you.
      </p>
      <p style="margin: 0 0 20px; color: #475569;">
        Thanks for trusting us with your moments. We’ll take good care of it.
      </p>
      <p style="margin: 0; font-weight: 600;">— Olu</p>
      <p style="margin: 0; color: #64748b;">Founder, MomentOS 💛</p>
    </div>
  </div>
</div>`;

  return { subject, html, text };
}
