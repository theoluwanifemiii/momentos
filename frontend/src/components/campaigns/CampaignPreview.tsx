import { useEffect, useMemo, useRef, useState } from 'react';
import SmsMeter from './SmsMeter';
import { renderPreview } from '../../lib/campaignRender';
import type { PreviewTemplate } from '../../lib/campaignRender';
import type { Channel } from './types';

// Shows the campaign as the recipient will get it. The rendering comes from
// lib/campaignRender, which mirrors the send path, so what is shown here is
// what goes out — including which template wins and how {{variables}} expand.

type CampaignPreviewProps = {
  name: string;
  subject: string;
  bodyText: string;
  smsText: string;
  replyTo: string;
  template: PreviewTemplate | null;
  channels: Channel[];
  fromName?: string;
  fromEmail?: string;
};

type Viewport = 'desktop' | 'mobile';

const VIEWPORT: Record<Viewport, { width: number; height: number; label: string }> = {
  desktop: { width: 1440, height: 900, label: '1440 × 900' },
  mobile: { width: 390, height: 844, label: '390 × 844' },
};

function ScaledFrame({
  document: srcDoc,
  width,
  height,
  onScale,
}: {
  document: string;
  width: number;
  height: number;
  onScale?: (scale: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailable(entry.contentRect.width)
    );
    observer.observe(element);
    setAvailable(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const scale = available > 0 ? Math.min(1, available / width) : 1;

  useEffect(() => {
    onScale?.(scale);
  }, [scale, onScale]);

  return (
    <div ref={ref} className="overflow-hidden">
      <div style={{ height: height * scale }}>
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={srcDoc}
          className="block border-0 bg-white"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  );
}

export default function CampaignPreview({
  name,
  subject,
  bodyText,
  smsText,
  replyTo,
  template,
  channels,
  fromName = 'MomentOS',
  fromEmail = 'moments@mail.usemomentos.xyz',
}: CampaignPreviewProps) {
  
  const [channel, setChannel] = useState<Channel>('email');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [expanded, setExpanded] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  const preview = useMemo(
    () =>
      renderPreview({
        campaign: { subject, bodyText, smsText },
        template,
        campaignName: name,
      }),
    [subject, bodyText, smsText, template, name]
  );

  const device = VIEWPORT[viewport];

  const emailDocument = useMemo(() => {
    const inner =
      preview.html ||
      `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#0f172a;white-space:pre-wrap;">${preview.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')}</div>`;
    return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><style>body{margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}img{max-width:100%;height:auto;}</style></head><body>${inner}</body></html>`;
  }, [preview.html, preview.text]);

  const channelOff = !channels.includes(channel);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {(['email', 'sms'] as Channel[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setChannel(option)}
              className={
                'rounded-md px-3 py-1 text-xs font-medium uppercase transition ' +
                (channel === option
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700')
              }
            >
              {option}
            </button>
          ))}
        </div>

        {channel === 'email' ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-slate-400">
              {device.label} · {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              Expand
            </button>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {(['desktop', 'mobile'] as Viewport[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setViewport(option)}
                  className={
                    'rounded-md px-3 py-1 text-xs font-medium capitalize transition ' +
                    (viewport === option
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700')
                  }
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {channelOff ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {channel === 'sms' ? 'SMS' : 'Email'} is not switched on for this campaign — this
          is a preview only.
        </p>
      ) : null}

      {channel === 'email' && preview.templateIgnoresBody ? (
        <p className="ds-alert ds-alert-error">
          <strong>{template?.name}</strong> has no{' '}
          <code className="rounded bg-white/60 px-1">{'{{body}}'}</code> slot, so the email
          sends the template as authored and the message you typed is used only for SMS and
          the plain-text fallback.
        </p>
      ) : null}

      {channel === 'email' ? (
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
          <div className="mx-auto max-w-full bg-white shadow-sm">
            <div className="space-y-1 border-b border-slate-200 px-4 py-3">
              <p className="truncate text-sm font-semibold text-slate-900">
                {preview.subject || <span className="text-slate-400">No subject yet</span>}
              </p>
              <p className="truncate text-xs text-slate-500">
                {fromName} &lt;{fromEmail}&gt;
              </p>
              {replyTo ? (
                <p className="truncate text-xs text-slate-400">Replies to {replyTo}</p>
              ) : null}
            </div>

            <ScaledFrame
              document={emailDocument}
              width={device.width}
              height={device.height}
              onScale={setScale}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
          <div className="mx-auto w-[300px] max-w-full rounded-[2rem] border-8 border-slate-900 bg-white p-3 shadow-sm">
            <p className="pb-2 text-center text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {name || 'Your campaign'}
            </p>
            <div className="max-h-[420px] overflow-auto">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2">
                <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-900">
                  {preview.sms || (
                    <span className="text-slate-400">Your message will appear here</span>
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-3 max-w-[300px]">
            <SmsMeter text={smsText.trim() || bodyText} />
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Preview uses sample recipient details, so{' '}
        <code className="rounded bg-slate-100 px-1">{'{{first_name}}'}</code> shows as Ada.
      </p>

      {expanded ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-4 sm:p-8"
          onClick={() => setExpanded(false)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {preview.subject || 'No subject yet'}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {fromName} &lt;{fromEmail}&gt;
                  {replyTo ? ` · replies to ${replyTo}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  {(['desktop', 'mobile'] as Viewport[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setViewport(option)}
                      className={
                        'rounded-md px-3 py-1 text-xs font-medium capitalize transition ' +
                        (viewport === option
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700')
                      }
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-100 p-4">
              <div className="mx-auto" style={{ maxWidth: device.width }}>
                <ScaledFrame
                  document={emailDocument}
                  width={device.width}
                  height={device.height}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
