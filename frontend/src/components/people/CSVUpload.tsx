import { useState } from 'react';
import { api, API_URL } from '../../api';
import { OnboardingState } from '../../types/onboarding';
import NextStepPanel from '../onboarding/NextStepPanel';
import OnboardingBanner from '../onboarding/OnboardingBanner';
import { Button, Card, CardBody, CardHeader } from '../ui';

// People: upload CSV for bulk creation.
type CSVUploadProps = {
  onboarding: OnboardingState | null;
  onOnboardingUpdate: (next: OnboardingState) => void;
  onSelectTab?: (tab: 'people' | 'templates' | 'settings' | 'upcoming' | 'dashboard') => void;
};

export default function CSVUpload({ onboarding, onOnboardingUpdate, onSelectTab }: CSVUploadProps) {
  const [csvContent, setCsvContent] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      // Try UTF-8 first; if replacement chars appear (U+FFFD), the file is
      // likely Windows-1252 (common when saving CSV from Excel on Windows).
      // Fall back to windows-1252 so names with non-Latin characters
      // (e.g. Yoruba diacritics: ọ, ẹ, ṣ) survive the round-trip.
      let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      if (text.includes('�')) {
        text = new TextDecoder('windows-1252').decode(buffer);
      }
      setCsvContent(text);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubmit = async () => {
    if (!csvContent) return;

    setLoading(true);
    setResult(null);

    try {
      const data = await api.call('/people/upload', {
        method: 'POST',
        body: JSON.stringify({ csvContent }),
      });
      setResult(data);
      setCsvContent('');
      if (data.onboarding) {
        onOnboardingUpdate(data.onboarding);
        if (data.summary?.validRows > 0) {
          const nextStep =
            data.onboarding.steps?.find((step: any) => step.id === data.onboarding.currentStepId) ||
            data.onboarding.steps?.find((step: any) => step.status === 'active');
          if (nextStep) {
            setSuccessMessage(`✅ People uploaded successfully. Next: ${nextStep.title}.`);
          } else {
            setSuccessMessage('✅ People uploaded successfully.');
          }
        }
      }
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const downloadSample = () => {
    window.open(`${API_URL}/people/sample-csv`, '_blank');
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold">Upload People</h2>
        <Button onClick={downloadSample} variant="ghost" size="sm">
          Download sample CSV
        </Button>
      </CardHeader>

      <CardBody className="space-y-4">
        {successMessage && (
          <OnboardingBanner
            title="Upload complete"
            message={successMessage}
            onDismiss={() => setSuccessMessage('')}
          />
        )}
        <NextStepPanel
          onboarding={onboarding}
          onSelectTab={onSelectTab}
        />
        <div>
          <label className="ds-label mb-2">Select CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="ds-file-input"
          />
        </div>

        {csvContent && (
          <>
            <div>
              <label className="ds-label mb-2">Preview</label>
              <textarea
                value={csvContent.slice(0, 500) + (csvContent.length > 500 ? '...' : '')}
                readOnly
                className="ds-textarea h-32 bg-slate-50 font-mono"
              />
            </div>

            <Button
              onClick={handleSubmit}
              loading={loading}
              className="w-full sm:w-auto"
            >
              Upload & Validate
            </Button>
          </>
        )}

        {result && (
          <div className={result.error ? 'ds-alert ds-alert-error' : 'ds-alert ds-alert-success'}>
            {result.error ? (
              <p className="font-medium">{result.error}</p>
            ) : (
              <div>
                <p className="mb-2 font-medium">Upload Summary</p>
                <ul className="text-sm space-y-1">
                  <li>Valid rows: {result.summary.validRows}</li>
                  <li>Error rows: {result.summary.errorRows}</li>
                  <li>Total processed: {result.summary.totalRows}</li>
                </ul>
                {result.errors.length > 0 && (
                  <div className="mt-4">
                    <p className="font-medium text-sm mb-2">Errors:</p>
                    <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                      {result.errors.map((err: any, i: number) => (
                        <li key={i} className="text-red-700/90">
                          Row {err.row}: {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.aiSuggestions && result.aiSuggestions.length > 0 && (
                  <div className="mt-4">
                    <p className="font-medium text-sm mb-2">AI Suggestions:</p>
                    <ul className="text-sm space-y-1">
                      {result.aiSuggestions.map((suggestion: string, i: number) => (
                        <li key={i} className="text-blue-700/90">
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
