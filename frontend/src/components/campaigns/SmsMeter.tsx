import { useMemo } from 'react';
import { analyzeSms, MAX_SMS_SEGMENTS } from '../../lib/smsSegments';

// Live SMS length readout. Shows the billed length rather than the raw string
// length, because {{first_name}} expands and non-GSM characters (₦, emoji,
// smart quotes) silently cut the per-segment budget from 160 down to 70.

type SmsMeterProps = {
  text: string;
  /** Sample values so the count reflects a real recipient, not the raw tokens. */
  sampleName?: string;
};

const interpolate = (template: string, name: string) =>
  template
    .replace(/\{\{first_name\}\}/g, name)
    .replace(/\{\{last_name\}\}/g, '')
    .replace(/\{\{full_name\}\}/g, name);

export default function SmsMeter({ text, sampleName = 'Oluwadamilola' }: SmsMeterProps) {
  const info = useMemo(() => analyzeSms(interpolate(text, sampleName)), [text, sampleName]);

  const overLimit = info.segments > MAX_SMS_SEGMENTS;
  const nearLimit = !overLimit && info.segments >= MAX_SMS_SEGMENTS;
  const tone = overLimit
    ? 'text-red-600'
    : nearLimit
      ? 'text-amber-600'
      : 'text-slate-500';

  const barPct = info.capacity > 0 ? Math.min(100, (info.length / info.capacity) * 100) : 0;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={
            'h-full rounded-full transition-all ' +
            (overLimit ? 'bg-red-500' : nearLimit ? 'bg-amber-500' : 'bg-blue-500')
          }
          style={{ width: `${barPct}%` }}
        />
      </div>

      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${tone}`}>
        <span className="font-medium tabular-nums">
          {info.length} / {info.capacity} characters
        </span>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span className="tabular-nums">
          {info.segments} SMS{info.segments === 1 ? '' : ' segments'}
        </span>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span>{info.encoding === 'UCS2' ? 'Unicode (70/segment)' : 'GSM-7 (160/segment)'}</span>
        {info.segments > 0 && !overLimit ? (
          <span className="tabular-nums text-slate-400">
            {info.remaining} left before segment {info.segments + 1}
          </span>
        ) : null}
      </div>

      {info.encoding === 'UCS2' && info.unsupportedCharacters.length > 0 ? (
        <p className="text-xs text-amber-700">
          These characters force Unicode and cut each segment to 70 characters:{' '}
          <span className="font-medium">
            {info.unsupportedCharacters.slice(0, 8).join(' ')}
          </span>
          . Replacing them (for example <span className="font-medium">NGN</span> instead of{' '}
          <span className="font-medium">₦</span>) more than doubles what fits per segment.
        </p>
      ) : null}

      {overLimit ? (
        <p className="text-xs font-medium text-red-600">
          Over the {MAX_SMS_SEGMENTS}-segment limit. Each segment bills separately, so this
          message will be rejected until it is shortened.
        </p>
      ) : null}
    </div>
  );
}
