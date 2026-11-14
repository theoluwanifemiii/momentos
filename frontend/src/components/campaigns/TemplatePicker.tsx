import { hasBodySlot } from '../../lib/campaignRender';
import type { CampaignTemplateOption } from './types';

// Visual template chooser. Campaign templates are authored with a {{body}}
// slot, so they wrap the typed message; the card flags any that somehow lack
// one, since that would silently drop the message from the email.

type TemplatePickerProps = {
  templates: CampaignTemplateOption[];
  value: string;
  onChange: (templateId: string) => void;
};

const Card = ({
  active,
  title,
  caption,
  tone,
  onClick,
}: {
  active: boolean;
  title: string;
  caption: string;
  tone?: 'warn';
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={
      'rounded-lg border p-3 text-left transition ' +
      (active
        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
        : 'border-slate-200 hover:border-slate-300')
    }
  >
    <span className="block truncate text-sm font-medium text-slate-900">{title}</span>
    <span
      className={
        'mt-1 block text-xs ' + (tone === 'warn' ? 'text-amber-600' : 'text-slate-500')
      }
    >
      {caption}
    </span>
  </button>
);

export default function TemplatePicker({
  templates,
  value,
  onChange,
}: TemplatePickerProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card
        active={!value}
        title="No template"
        caption="Sends your message as plain text"
        onClick={() => onChange('')}
      />
      {templates.map((template) => {
        const wraps = hasBodySlot(template.content || '');
        return (
          <Card
            key={template.id}
            active={value === template.id}
            title={template.name}
            tone={wraps ? undefined : 'warn'}
            caption={
              wraps
                ? 'Wraps your message in this design'
                : 'Missing its {{body}} slot — your message would be dropped'
            }
            onClick={() => onChange(template.id)}
          />
        );
      })}
    </div>
  );
}
