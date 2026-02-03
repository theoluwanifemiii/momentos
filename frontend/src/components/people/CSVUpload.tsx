import { useState } from 'react';
import { api, API_URL } from '../../api';
import { OnboardingState } from '../../types/onboarding';
import NextStepPanel from '../onboarding/NextStepPanel';
import OnboardingBanner from '../onboarding/OnboardingBanner';

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
      setCsvContent(event.target?.result as string);
    };
    reader.readAsText(file);
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
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Upload People</h2>

      <div className="mb-4">
        <button
          onClick={downloadSample}
          className="text-sm text-blue-600 hover:underline"
        >
          Download sample CSV
        </button>
      </div>

      <div className="space-y-4">
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
          <label className="block text-sm font-medium mb-2">Select CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded file:border-0
              file:text-sm file:font-medium
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
        </div>

        {csvContent && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">Preview</label>
              <textarea
                value={csvContent.slice(0, 500) + (csvContent.length > 500 ? '...' : '')}
                readOnly
                className="w-full h-32 px-3 py-2 border rounded bg-gray-50 text-sm font-mono"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 w-full sm:w-auto"
            >
              {loading ? 'Uploading...' : 'Upload & Validate'}
            </button>
          </>
        )}

        {result && (
          <div className={`p-4 rounded ${result.error ? 'bg-red-50' : 'bg-green-50'}`}>
            {result.error ? (
              <p className="text-red-800 font-medium">{result.error}</p>
            ) : (
              <div>
                <p className="text-green-800 font-medium mb-2">Upload Summary</p>
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
                        <li key={i} className="text-red-700">
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
                        <li key={i} className="text-blue-700">
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
      </div>
    </div>
  );
}
