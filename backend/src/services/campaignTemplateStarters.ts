const shell = (accent: string, header: string, footer: string) => `
<div style="margin:0;padding:24px 12px;background:#f1f5f9;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    ${header}
    <div style="padding:28px 32px;font-size:15px;line-height:1.65;color:#0f172a;">
      {{body}}
    </div>
    <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;">
      ${footer}
    </div>
  </div>
  <p style="max-width:600px;margin:12px auto 0;font-size:11px;color:#94a3b8;text-align:center;">
    Sent with ${accent}
  </p>
</div>`.trim();

export const CAMPAIGN_TEMPLATE_STARTERS: {
  name: string;
  subject: string | null;
  content: string;
}[] = [
  {
    name: "Clean",
    subject: null,
    content: shell(
      "MomentOS",
      `<div style="padding:28px 32px 0;"></div>`,
      `You are receiving this because you are on this campaign's list.`
    ),
  },
  {
    name: "Bold header",
    subject: null,
    content: shell(
      "MomentOS",
      `<div style="padding:26px 32px;background:#2563eb;">
        <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">{{campaign_name}}</p>
      </div>`,
      `You are receiving this because you are on this campaign's list.`
    ),
  },
  {
    name: "Warm note",
    subject: null,
    content: shell(
      "MomentOS",
      `<div style="padding:26px 32px 0;">
        <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#b45309;">A note for you</p>
      </div>`,
      `Reply to this email if you have any questions — a real person reads them.`
    ),
  },
];
