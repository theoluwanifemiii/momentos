import { useEffect, useRef, useState } from 'react';
import { CAMPAIGN_VARIABLES } from '../../lib/campaignRender';

// A text input or textarea with an "Insert variable" menu. Inserting writes at
// the caret and restores focus, so the user never types {{first_name}} by hand.

type VariableFieldProps = {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  children?: React.ReactNode;
};

export default function VariableField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 8,
  children,
}: VariableFieldProps) {
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const insert = (key: string) => {
    const token = `{{${key}}}`;
    const field = fieldRef.current;
    // Without a live field reference the caret position is unknown, so append.
    const start = field?.selectionStart ?? value.length;
    const end = field?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    setOpen(false);

    // The value lands via React state, so move the caret on the next frame.
    requestAnimationFrame(() => {
      if (!field) return;
      const caret = start + token.length;
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  };

  return (
    <div ref={wrapRef}>
      <div className="flex items-end justify-between gap-3">
        <label className="ds-label">{label}</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="mb-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            + Insert variable
          </button>
          {open ? (
            <div className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {CAMPAIGN_VARIABLES.map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  onClick={() => insert(variable.key)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{variable.label}</span>
                  <span className="shrink-0 text-slate-400">{variable.sample}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {multiline ? (
        <textarea
          ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
          className="ds-input font-sans"
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          className="ds-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
      {children}
    </div>
  );
}
