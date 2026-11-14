// Renders a campaign exactly as the send path will, so the editor preview can
// be trusted. Mirrors resolveEmailBody in backend/src/services/campaignSender.ts
// and worker/campaignRunner.ts — change all three together.

export const BODY_SLOT_PATTERN = /\{\{\s*body\s*\}\}/g;

export const hasBodySlot = (content: string) =>
  new RegExp(BODY_SLOT_PATTERN.source).test(content);

/** Escapes a plain-text body and preserves its paragraph breaks as HTML. */
export const textToHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;">${block.replace(/\n/g, '<br />')}</p>`
    )
    .join('\n');

/** Replaces every {{body}} slot. Uses a function so $-sequences stay literal. */
const fillBodySlot = (content: string, body: string) =>
  content.replace(BODY_SLOT_PATTERN, () => body);

export type PreviewTemplate = {
  id: string;
  name: string;
  subject?: string | null;
  type?: string | null;
  content?: string | null;
};

export type PreviewCampaign = {
  subject: string;
  bodyText: string;
  smsText?: string | null;
};

/** The variables the sender exposes, with sample values for the preview. */
export const CAMPAIGN_VARIABLES: {
  key: string;
  label: string;
  sample: string;
}[] = [
  { key: 'first_name', label: 'First name', sample: 'Ada' },
  { key: 'last_name', label: 'Last name', sample: 'Obi' },
  { key: 'full_name', label: 'Full name', sample: 'Ada Obi' },
  { key: 'email', label: 'Email', sample: 'ada@example.com' },
  { key: 'phone', label: 'Phone', sample: '+234 801 234 5678' },
  { key: 'campaign_name', label: 'Campaign name', sample: 'Monthly reminder' },
];

export const sampleVariables = (campaignName: string) => {
  const values: Record<string, string> = {};
  CAMPAIGN_VARIABLES.forEach((variable) => {
    values[variable.key] = variable.sample;
  });
  values.campaign_name = campaignName || values.campaign_name;
  return values;
};

/** Same {{key}} substitution the server uses. */
export const interpolate = (
  text: string,
  variables: Record<string, string>
) => {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), () => value);
  }
  return result;
};

export const resolveEmailBody = (
  campaign: PreviewCampaign,
  template: PreviewTemplate | null,
  /** Last-resort subject, matching the sender's campaign.name fallback. */
  campaignName = ''
) => {
  if (template?.content) {
    const subject = campaign.subject || template.subject || campaignName;

    if (template.type === 'PLAIN_TEXT') {
      return {
        subject,
        html: undefined as string | undefined,
        text: hasBodySlot(template.content)
          ? fillBodySlot(template.content, campaign.bodyText)
          : template.content,
      };
    }

    return {
      subject,
      html: hasBodySlot(template.content)
        ? fillBodySlot(template.content, textToHtml(campaign.bodyText))
        : template.content,
      text: campaign.bodyText,
    };
  }

  return {
    subject: campaign.subject,
    html: undefined as string | undefined,
    text: campaign.bodyText,
  };
};

/** SMS falls back to the email plain text when no dedicated smsText is set. */
export const resolveSmsBody = (campaign: PreviewCampaign) =>
  (campaign.smsText && campaign.smsText.trim()) || campaign.bodyText;

/** Everything the preview needs, already interpolated with sample values. */
export const renderPreview = (params: {
  campaign: PreviewCampaign;
  template: PreviewTemplate | null;
  campaignName: string;
}) => {
  const variables = sampleVariables(params.campaignName);
  const email = resolveEmailBody(
    params.campaign,
    params.template,
    params.campaignName
  );

  return {
    subject: interpolate(email.subject, variables),
    html: email.html ? interpolate(email.html, variables) : undefined,
    text: interpolate(email.text, variables),
    sms: interpolate(resolveSmsBody(params.campaign), variables),
    /** True when a template is attached but will discard the typed message. */
    templateIgnoresBody: Boolean(
      params.template?.content && !hasBodySlot(params.template.content)
    ),
  };
};
