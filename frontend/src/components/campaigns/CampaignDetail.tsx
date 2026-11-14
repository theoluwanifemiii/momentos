import { useCallback, useEffect, useState } from 'react';
import { Button, Input } from '../ui';
import ContactImport from './ContactImport';
import type { Campaign, CampaignContact, CampaignDelivery } from './types';
import { RECURRENCE_LABELS, STATUS_LABELS } from './types';

type ApiClient = { call: (endpoint: string, options?: RequestInit) => Promise<any> };

type CampaignDetailProps = {
  api: ApiClient;
  campaignId: string;
  onBack: () => void;
  onEdit: (campaign: Campaign) => void;
  onChanged: () => void;
};

const formatDateTime = (value: string | null, timezone?: string) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    return new Date(value).toLocaleString();
  }
};

const statusTone: Record<string, string> = {
  SENT: 'bg-emerald-50 text-emerald-700',
  DELIVERED: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  SENDING: 'bg-blue-50 text-blue-700',
  QUEUED: 'bg-slate-100 text-slate-600',
  OPTED_OUT: 'bg-amber-50 text-amber-700',
};

export default function CampaignDetail({
  api,
  campaignId,
  onBack,
  onEdit,
  onChanged,
}: CampaignDetailProps) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<CampaignContact[]>([]);
  const [deliveries, setDeliveries] = useState<CampaignDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [testTarget, setTestTarget] = useState('');
  const [tab, setTab] = useState<'contacts' | 'report'>('contacts');

  const load = useCallback(async () => {
    try {
      const data = await api.call(`/campaigns/${campaignId}`);
      setCampaign(data.campaign);
      setContacts(data.contacts || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Could not load the campaign.');
    } finally {
      setLoading(false);
    }
  }, [api, campaignId]);

  const loadDeliveries = useCallback(async () => {
    try {
      const data = await api.call(`/campaigns/${campaignId}/deliveries`);
      setDeliveries(data.deliveries || []);
    } catch {
      // The report is supplementary; a failure here should not blank the page.
    }
  }, [api, campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === 'report') void loadDeliveries();
  }, [tab, loadDeliveries]);

  const setStatus = async (status: Campaign['status']) => {
    setBusy(status);
    setError('');
    try {
      const data = await api.call(`/campaigns/${campaignId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setCampaign(data.campaign);
      onChanged();
    } catch (err: any) {
      setError(err.message || 'Could not update the campaign.');
    } finally {
      setBusy('');
    }
  };

  const sendTest = async () => {
    if (!testTarget.trim()) return;
    setBusy('test');
    setError('');
    setNotice('');
    try {
      const isPhone = /^[+\d][\d\s()-]{6,}$/.test(testTarget.trim());
      await api.call(`/campaigns/${campaignId}/test`, {
        method: 'POST',
        body: JSON.stringify(
          isPhone ? { phone: testTarget.trim() } : { email: testTarget.trim() }
        ),
      });
      setNotice(`Test sent to ${testTarget.trim()}.`);
      setTestTarget('');
    } catch (err: any) {
      setError(err.message || 'Test send failed.');
    } finally {
      setBusy('');
    }
  };

  const sendNow = async () => {
    const active = contacts.filter((c) => !c.optedOut).length;
    if (
      !window.confirm(
        `Send this campaign to ${active} contact${active === 1 ? '' : 's'} right now?`
      )
    ) {
      return;
    }
    setBusy('send');
    setError('');
    setNotice('');
    try {
      const data = await api.call(`/campaigns/${campaignId}/send-now`, { method: 'POST' });
      setNotice(
        `Sending to ${data.contacts} contact${data.contacts === 1 ? '' : 's'}. Open the Report tab to follow progress.`
      );
      setTab('report');
      // The send runs in the background, so give it a moment before the first read.
      setTimeout(() => void loadDeliveries(), 1500);
    } catch (err: any) {
      setError(err.message || 'Could not start the send.');
    } finally {
      setBusy('');
    }
  };

  const toggleOptOut = async (contact: CampaignContact) => {
    try {
      await api.call(`/campaigns/${campaignId}/contacts/${contact.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ optedOut: !contact.optedOut }),
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not update the contact.');
    }
  };

  const removeContact = async (contact: CampaignContact) => {
    if (!window.confirm(`Remove ${contact.firstName} from this campaign?`)) return;
    try {
      await api.call(`/campaigns/${campaignId}/contacts/${contact.id}`, {
        method: 'DELETE',
      });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not remove the contact.');
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading campaign…</p>;
  if (!campaign) {
    return (
      <div className="space-y-4">
        <p className="ds-alert ds-alert-error">{error || 'Campaign not found.'}</p>
        <Button variant="ghost" onClick={onBack}>
          Return to campaigns
        </Button>
      </div>
    );
  }

  const activeContacts = contacts.filter((c) => !c.optedOut).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            All campaigns
          </button>
          <h2 className="mt-2 text-xl font-bold text-slate-900">{campaign.name}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {STATUS_LABELS[campaign.status]} ·{' '}
            {RECURRENCE_LABELS[campaign.recurrenceRule]}
            {campaign.recurrenceRule === 'CUSTOM' && campaign.customIntervalDays
              ? ` (${campaign.customIntervalDays} days)`
              : ''}{' '}
            · {campaign.deliveryChannels.join(' + ')} · {activeContacts} recipient
            {activeContacts === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(campaign)}>
            Edit
          </Button>
          {campaign.status === 'ACTIVE' ? (
            <Button
              variant="secondary"
              size="sm"
              loading={busy === 'PAUSED'}
              onClick={() => setStatus('PAUSED')}
            >
              Pause
            </Button>
          ) : campaign.status !== 'COMPLETED' ? (
            <Button
              size="sm"
              loading={busy === 'ACTIVE'}
              onClick={() => setStatus('ACTIVE')}
            >
              Activate
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'send'}
            onClick={sendNow}
            disabled={activeContacts === 0}
          >
            Send now
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="ds-surface p-4">
          <p className="text-xs text-slate-500">Next scheduled send</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {campaign.status === 'ACTIVE'
              ? formatDateTime(campaign.nextRuns[0] || null, campaign.timezone)
              : 'Not scheduled'}
          </p>
          {campaign.status !== 'ACTIVE' ? (
            <p className="mt-1 text-xs text-slate-400">
              Activate the campaign to start the schedule.
            </p>
          ) : campaign.nextRuns.length > 1 ? (
            <p className="mt-1 text-xs text-slate-400">
              then {formatDateTime(campaign.nextRuns[1], campaign.timezone)}
            </p>
          ) : null}
        </div>
        <div className="ds-surface p-4">
          <p className="text-xs text-slate-500">Last sent</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatDateTime(campaign.lastRunAt, campaign.timezone)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {campaign.runCount} run{campaign.runCount === 1 ? '' : 's'} so far
          </p>
        </div>
        <div className="ds-surface p-4">
          <p className="text-xs text-slate-500">Send a test</p>
          <div className="mt-2 flex gap-2">
            <Input
              value={testTarget}
              onChange={(e) => setTestTarget(e.target.value)}
              placeholder="you@example.com"
            />
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'test'}
              onClick={sendTest}
              disabled={!testTarget.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      </div>

      {error ? <p className="ds-alert ds-alert-error">{error}</p> : null}
      {notice ? <p className="ds-alert ds-alert-success">{notice}</p> : null}

      <div className="flex gap-1 border-b border-slate-200">
        {(['contacts', 'report'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              'px-3 py-2 text-sm font-medium transition ' +
              (tab === key
                ? 'border-b-2 border-slate-900 text-slate-900'
                : 'text-slate-500 hover:text-slate-700')
            }
          >
            {key === 'contacts' ? `Recipients (${contacts.length})` : 'Report'}
          </button>
        ))}
      </div>

      {tab === 'contacts' ? (
        <div className="space-y-5">
          <ContactImport api={api} campaignId={campaignId} onImported={load} />

          {contacts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No recipients yet. Upload a CSV above to build this campaign's list.
            </p>
          ) : (
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th className="ds-th">Name</th>
                    <th className="ds-th">Email</th>
                    <th className="ds-th">Phone</th>
                    <th className="ds-th">Status</th>
                    <th className="ds-th" />
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id}>
                      <td className="ds-td font-medium text-slate-900">
                        {[contact.firstName, contact.lastName].filter(Boolean).join(' ')}
                      </td>
                      <td className="ds-td break-all text-slate-600">
                        {contact.email || '—'}
                      </td>
                      <td className="ds-td text-slate-600">{contact.phone || '—'}</td>
                      <td className="ds-td">
                        <span
                          className={
                            'rounded-full px-2 py-0.5 text-xs font-medium ' +
                            (contact.optedOut
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700')
                          }
                        >
                          {contact.optedOut ? 'Opted out' : 'Receiving'}
                        </span>
                      </td>
                      <td className="ds-td">
                        <div className="flex justify-end gap-3 text-xs">
                          <button
                            className="font-medium text-slate-500 hover:text-slate-900"
                            onClick={() => toggleOptOut(contact)}
                          >
                            {contact.optedOut ? 'Resume' : 'Opt out'}
                          </button>
                          <button
                            className="font-medium text-red-500 hover:text-red-700"
                            onClick={() => removeContact(contact)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={loadDeliveries}>
              Refresh
            </Button>
          </div>
          {deliveries.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing sent yet. Deliveries appear here once the campaign runs.
            </p>
          ) : (
            <div className="ds-table-wrap">
              <table className="ds-table">
                <thead>
                  <tr>
                    <th className="ds-th">Recipient</th>
                    <th className="ds-th">Channel</th>
                    <th className="ds-th">Status</th>
                    <th className="ds-th">When</th>
                    <th className="ds-th">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((delivery) => (
                    <tr key={delivery.id}>
                      <td className="ds-td">
                        <span className="font-medium text-slate-900">
                          {delivery.contact.firstName}
                        </span>
                        <span className="block break-all text-xs text-slate-500">
                          {delivery.channel === 'sms'
                            ? delivery.contact.phone
                            : delivery.contact.email}
                        </span>
                      </td>
                      <td className="ds-td uppercase text-slate-600">{delivery.channel}</td>
                      <td className="ds-td">
                        <span
                          className={
                            'rounded-full px-2 py-0.5 text-xs font-medium ' +
                            (statusTone[delivery.status] || 'bg-slate-100 text-slate-600')
                          }
                        >
                          {delivery.status}
                        </span>
                      </td>
                      <td className="ds-td text-slate-600">
                        {formatDateTime(delivery.sentAt || delivery.createdAt, campaign.timezone)}
                      </td>
                      <td className="ds-td text-xs text-slate-500">
                        {delivery.errorMessage
                          ? delivery.errorMessage
                          : delivery.segments
                            ? `${delivery.segments} segment${delivery.segments === 1 ? '' : 's'}`
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
