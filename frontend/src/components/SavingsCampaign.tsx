import { useState } from 'react';
import { Button } from './ui';

type ApiClient = {
  call: (endpoint: string, options?: RequestInit) => Promise<any>;
};

const recipients = [
  { firstName: 'Victoria', email: 'toriawendu@gmail.com' },
  { firstName: 'Wuraola', email: 'wuraduhnie@gmail.com' },
  { firstName: 'Ameryths', email: 'amethys011@gmail.com' },
  { firstName: 'Damilola', email: 'pheyidamilola@gmail.com' },
];

const subject = 'Monthly ₦50,000 Savings Challenge Contribution';
const body = `Hi {{first_name}},

I hope you're doing well.

It’s the end of the month, which means it’s time to make our monthly contribution towards the ₦50,000 Savings Challenge.

Remember, the goal is to consistently save towards ₦50,000 and reach our target by January 2027. Every monthly contribution brings us one step closer to achieving that goal.

HOW TO MAKE THE CONTRIBUTION

If you selected to save by yourself:

Please log into your PiggyVest account and fund the ₦50,000 savings target with your monthly contribution. Once you have funded your target, please reply to this email with your payment confirmation so I can update your savings record and celebrate your progress with you.

If you selected that we save for you:

Please transfer your monthly contribution to the account below:

Account Name: Damilola Shopade
Bank: Paystack Titan
Account Number: 9846667083

After making the transfer, reply to this email with your payment confirmation so I can update your savings record.

Thank you for choosing to build a consistent savings habit. It may seem like a small contribution each month, but staying consistent is what gets you to the goal. Keep going. ₦50,000 is the goal, but the bigger win is becoming someone who saves consistently.

If you have any questions or need assistance, simply reply to this email.

Love,

Miss Feyi

Website: https://becomingdash.com/
IG: becomingdash`;

export default function SavingsCampaign({ api }: { api: ApiClient }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const sendCampaign = async () => {
    if (!window.confirm(`Send this email to all ${recipients.length} participants now?`)) return;
    setSending(true);
    setResult('');
    setError('');
    try {
      const data = await api.call('/campaigns/send', {
        method: 'POST',
        body: JSON.stringify({ subject, text: body, recipients }),
      });
      setResult(`Sent to ${data.sent} participant${data.sent === 1 ? '' : 's'}.`);
    } catch (err: any) {
      setError(err.message || 'Campaign send failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">One-off campaign</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">₦50,000 Savings Challenge</h1>
        <p className="mt-2 text-sm text-slate-600">
          From <strong>moments@mail.usemomentos.xyz</strong> · replies to <strong>becomingdashmain@gmail.com</strong>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="ds-surface p-5">
          <h2 className="font-semibold text-slate-900">Recipients ({recipients.length})</h2>
          <div className="mt-4 space-y-3">
            {recipients.map((recipient) => (
              <div key={recipient.email} className="border-b border-slate-100 pb-3 last:border-0">
                <p className="text-sm font-medium text-slate-900">{recipient.firstName}</p>
                <p className="break-all text-xs text-slate-500">{recipient.email}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ds-surface p-5">
          <p className="text-sm font-semibold text-slate-900">{subject}</p>
          <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{body.replace('{{first_name}}', 'their first name')}</pre>
          {error ? <p className="ds-alert ds-alert-error mt-5">{error}</p> : null}
          {result ? <p className="ds-alert ds-alert-success mt-5">{result}</p> : null}
          <div className="mt-6 flex justify-end">
            <Button onClick={sendCampaign} disabled={sending || Boolean(result)}>
              {sending ? 'Sending…' : result ? 'Sent' : 'Send to everyone'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
