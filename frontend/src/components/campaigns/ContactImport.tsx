import { useRef, useState } from 'react';
import { Button } from '../ui';

// Uploads a campaign's own recipient list. These contacts are stored against
// the campaign only — they never enter the People database.

type ApiClient = { call: (endpoint: string, options?: RequestInit) => Promise<any> };

type ContactImportProps = {
  api: ApiClient;
  campaignId: string;
  onImported: () => void;
};

type ImportResult = {
  imported: number;
  skippedDuplicates: number;
  errors: { row: number; field?: string; message: string }[];
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    withEmail: number;
    withPhone: number;
  };
};

export default function ContactImport({ api, campaignId, onImported }: ContactImportProps) {
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      
      let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      if (text.includes('�')) {
        text = new TextDecoder('windows-1252').decode(buffer);
      }
      setCsvContent(text);
    };
    reader.readAsArrayBuffer(file);
  };

  const submit = async () => {
    if (!csvContent) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.call(`/campaigns/${campaignId}/contacts/import`, {
        method: 'POST',
        body: JSON.stringify({ csv: csvContent, mode }),
      });
      setResult(data);
      setCsvContent('');
      setFileName('');
      if (fileRef.current) fileRef.current.value = '';
      onImported();
    } catch (err: any) {
      setError(err.message || 'Import failed.');
      // The API returns per-row errors alongside a 400 so they stay visible.
      if (err.data?.errors) {
        setResult({
          imported: 0,
          skippedDuplicates: 0,
          errors: err.data.errors,
          summary: err.data.summary,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Upload recipients</p>
            <p className="mt-0.5 text-xs text-slate-500">
              CSV columns: <code className="rounded bg-white px-1">first_name</code> (or{' '}
              <code className="rounded bg-white px-1">name</code>),{' '}
              <code className="rounded bg-white px-1">phone</code>,{' '}
              <code className="rounded bg-white px-1">email</code>. Local numbers like 0803… are
              fine; duplicates are skipped.
            </p>
          </div>
          <a
            className="text-xs font-medium text-blue-600 hover:underline"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(
              'first_name,last_name,email,phone\nAda,Obi,ada@example.com,08012345678\n'
            )}`}
            download="campaign-contacts-template.csv"
          >
            Download template
          </a>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
        />

        {fileName ? (
          <p className="mt-2 text-xs text-slate-600">
            Ready to import <span className="font-medium">{fileName}</span>
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="radio"
              checked={mode === 'append'}
              onChange={() => setMode('append')}
            />
            Add to the existing list
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="radio"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
            />
            Replace the whole list
          </label>
        </div>

        <div className="mt-3 flex justify-end">
          <Button onClick={submit} disabled={!csvContent} loading={loading} size="sm">
            Import contacts
          </Button>
        </div>
      </div>

      {error ? <p className="ds-alert ds-alert-error">{error}</p> : null}

      {result ? (
        <div className="space-y-3">
          {result.imported > 0 ? (
            <p className="ds-alert ds-alert-success">
              Imported {result.imported} contact{result.imported === 1 ? '' : 's'}
              {result.skippedDuplicates > 0
                ? ` · skipped ${result.skippedDuplicates} already on the list`
                : ''}
              .
            </p>
          ) : null}

          {result.summary ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Rows read', result.summary.totalRows],
                ['Valid', result.summary.validRows],
                ['With email', result.summary.withEmail],
                ['With phone', result.summary.withPhone],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {value as number}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {result.errors?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">
                {result.errors.length} row{result.errors.length === 1 ? '' : 's'} skipped
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-amber-800">
                {result.errors.slice(0, 50).map((rowError, index) => (
                  <li key={`${rowError.row}-${index}`}>
                    Row {rowError.row}
                    {rowError.field ? ` (${rowError.field})` : ''}: {rowError.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
