import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select } from '../ui';

type ApiClient = {
  call: (endpoint: string, options?: RequestInit) => Promise<any>;
};

type FeedbackType = 'BUG_REPORT' | 'FEATURE_REQUEST' | 'SUGGESTION';

type FeedbackWidgetProps = {
  api: ApiClient;
};

const feedbackTypeOptions: Array<{ value: FeedbackType; label: string }> = [
  { value: 'BUG_REPORT', label: 'Bug Report' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'SUGGESTION', label: 'Suggestion' },
];

const initialForm: {
  type: FeedbackType;
  subject: string;
  message: string;
} = {
  type: 'BUG_REPORT',
  subject: '',
  message: '',
};

export default function FeedbackWidget({ api }: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState(initialForm);

  const pagePath = useMemo(() => {
    if (typeof window === 'undefined') return '/app';
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
    };
  }, [isOpen]);

  const resetForm = () => {
    setForm(initialForm);
    setError('');
    setSuccess('');
  };

  const openModal = () => {
    resetForm();
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
  };

  const submitFeedback = async () => {
    setError('');
    setSuccess('');

    if (!form.message.trim() || form.message.trim().length < 10) {
      setError('Please provide enough detail (at least 10 characters).');
      return;
    }

    setSaving(true);
    try {
      const result = await api.call('/feedback', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          subject: form.subject.trim() || undefined,
          message: form.message.trim(),
          pagePath,
        }),
      });
      if (result?.emailNotification?.sent === false) {
        setSuccess(
          `Feedback saved, but notification email was not delivered${
            result?.emailNotification?.error
              ? `: ${result.emailNotification.error}`
              : '.'
          }`
        );
      } else {
        setSuccess('Thanks. Your feedback has been submitted.');
      }
      setForm(initialForm);
    } catch (err: any) {
      setError(err.message || 'Failed to submit feedback.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          onClick={openModal}
          variant="secondary"
          className="border-slate-300 bg-white shadow-lg"
        >
          Report Feedback
        </Button>
      </div>

      {isOpen ? (
        <div className="ds-modal-shell">
          <div className="ds-modal-backdrop" onClick={closeModal} />
          <div className="ds-modal-position">
            <div className="ds-modal-panel max-w-xl">
              <div className="ds-modal-header">
                <div>
                  <h3 className="text-lg font-bold">Feedback</h3>
                  <p className="text-sm text-slate-600">
                    Report a bug, request a feature, or share a suggestion.
                  </p>
                </div>
                <Button onClick={closeModal} variant="ghost" size="sm">
                  Close
                </Button>
              </div>

              <div className="ds-card-body space-y-4">
                {error ? <div className="ds-alert ds-alert-error">{error}</div> : null}
                {success ? <div className="ds-alert ds-alert-success">{success}</div> : null}

                <div>
                  <label className="ds-label">Type</label>
                  <Select
                    value={form.type}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, type: event.target.value as FeedbackType }))
                    }
                  >
                    {feedbackTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="ds-label">Subject (optional)</label>
                  <Input
                    value={form.subject}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, subject: event.target.value }))
                    }
                    placeholder="Short summary"
                  />
                </div>

                <div>
                  <label className="ds-label">Details</label>
                  <textarea
                    value={form.message}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, message: event.target.value }))
                    }
                    rows={6}
                    className="ds-textarea"
                    placeholder="Tell us what happened, what you expected, and any context."
                  />
                </div>

                <p className="text-xs text-slate-500">
                  Current page: {pagePath}
                </p>

                <div className="flex justify-end gap-2">
                  <Button onClick={closeModal} variant="secondary" disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={submitFeedback} disabled={saving}>
                    {saving ? 'Submitting...' : 'Submit Feedback'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
