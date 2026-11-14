import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui';
import CampaignDetail from './CampaignDetail';
import CampaignEditor from './CampaignEditor';
import ContactImport from './ContactImport';
import type { Campaign, CampaignTemplateOption } from './types';
import { RECURRENCE_LABELS, STATUS_LABELS } from './types';

type ApiClient = { call: (endpoint: string, options?: RequestInit) => Promise<any> };

type CampaignsProps = { api: ApiClient };

type View =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; campaign: Campaign }
  | { mode: 'recipients'; campaign: Campaign }
  | { mode: 'detail'; campaignId: string };

const statusTone: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  DRAFT: 'bg-slate-100 text-slate-600',
  PAUSED: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-blue-50 text-blue-700',
};

const formatDate = (value: string | null, timezone?: string) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    return new Date(value).toLocaleDateString();
  }
};

export default function Campaigns({ api }: CampaignsProps) {
  const [view, setView] = useState<View>({ mode: 'list' });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<CampaignTemplateOption[]>([]);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCampaigns = useCallback(async () => {
    try {
      const data = await api.call('/campaigns');
      setCampaigns(data.campaigns || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not load campaigns.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    // Templates and the SMS flag drive the editor's options; a failure here
    // should degrade the form, not block the page.
    const loadOptions = async () => {
      try {
        const data = await api.call('/campaign-templates');
        setTemplates(data.campaignTemplates || []);
      } catch {
        setTemplates([]);
      }
      try {
        const settings = await api.call('/settings');
        setSmsEnabled(
          Boolean(settings?.organization?.smsEnabled ?? settings?.smsEnabled)
        );
      } catch {
        setSmsEnabled(false);
      }
    };
    void loadOptions();
  }, [api]);

  const remove = async (campaign: Campaign) => {
    if (
      !window.confirm(
        `Delete "${campaign.name}"? Its recipient list and send history go too.`
      )
    ) {
      return;
    }
    try {
      await api.call(`/campaigns/${campaign.id}`, { method: 'DELETE' });
      await loadCampaigns();
    } catch (err: any) {
      setError(err.message || 'Could not delete the campaign.');
    }
  };

  if (view.mode === 'create' || view.mode === 'edit') {
    return (
      <section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Campaigns
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {view.mode === 'edit' ? 'Edit campaign' : 'New campaign'}
          </h1>
        </div>
        <CampaignEditor
          api={api}
          campaign={view.mode === 'edit' ? view.campaign : null}
          templates={templates}
          smsEnabled={smsEnabled}
          onCancel={() =>
            setView(
              view.mode === 'edit'
                ? { mode: 'detail', campaignId: view.campaign.id }
                : { mode: 'list' }
            )
          }
          onSaved={async (campaign) => {
            await loadCampaigns();
            setView(
              view.mode === 'edit'
                ? { mode: 'detail', campaignId: campaign.id }
                : { mode: 'recipients', campaign }
            );
          }}
        />
      </section>
    );
  }

  if (view.mode === 'recipients') {
    const { campaign } = view;
    return (
      <section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Campaigns
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Add recipients</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            <strong>{campaign.name}</strong> is saved as a draft. Upload the list it should
            send to — these contacts stay with the campaign and never enter People.
          </p>
        </div>

        <div className="ds-surface p-5">
          <ContactImport
            api={api}
            campaignId={campaign.id}
            onImported={loadCampaigns}
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => setView({ mode: 'detail', campaignId: campaign.id })}
          >
            Skip for now
          </Button>
          <Button onClick={() => setView({ mode: 'detail', campaignId: campaign.id })}>
            Done
          </Button>
        </div>
      </section>
    );
  }

  if (view.mode === 'detail') {
    return (
      <section>
        <CampaignDetail
          api={api}
          campaignId={view.campaignId}
          onBack={() => setView({ mode: 'list' })}
          onEdit={(campaign) => setView({ mode: 'edit', campaign })}
          onChanged={loadCampaigns}
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            Campaigns
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Campaigns</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Send recurring email and SMS to a list you upload for the campaign. These
            recipients are kept with the campaign and never added to People.
          </p>
        </div>
        <Button onClick={() => setView({ mode: 'create' })}>New campaign</Button>
      </div>

      {error ? <p className="ds-alert ds-alert-error">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading campaigns…</p>
      ) : campaigns.length === 0 ? (
        <div className="ds-surface p-8 text-center">
          <p className="text-sm font-medium text-slate-900">No campaigns yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Create one to upload a recipient list, pick email or SMS, write the message and
            set how often it repeats.
          </p>
          <div className="mt-5 flex justify-center">
            <Button onClick={() => setView({ mode: 'create' })}>
              Create your first campaign
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="ds-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="text-left text-base font-semibold text-slate-900 hover:underline"
                      onClick={() =>
                        setView({ mode: 'detail', campaignId: campaign.id })
                      }
                    >
                      {campaign.name}
                    </button>
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (statusTone[campaign.status] || 'bg-slate-100 text-slate-600')
                      }
                    >
                      {STATUS_LABELS[campaign.status]}
                    </span>
                  </div>

                  <p className="mt-1 truncate text-sm text-slate-600">{campaign.subject}</p>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>{RECURRENCE_LABELS[campaign.recurrenceRule]}</span>
                    <span>·</span>
                    <span className="uppercase">
                      {campaign.deliveryChannels.join(' + ')}
                    </span>
                    <span>·</span>
                    <span>
                      {campaign.contactCount} recipient
                      {campaign.contactCount === 1 ? '' : 's'}
                    </span>
                    {campaign.status === 'ACTIVE' && campaign.nextRuns[0] ? (
                      <>
                        <span>·</span>
                        <span>
                          Next {formatDate(campaign.nextRuns[0], campaign.timezone)}
                        </span>
                      </>
                    ) : null}
                    {campaign.sms && campaign.sms.segments > 1 ? (
                      <>
                        <span>·</span>
                        <span className="text-amber-600">
                          SMS is {campaign.sms.segments} segments
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setView({ mode: 'detail', campaignId: campaign.id })}
                  >
                    Open
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(campaign)}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
