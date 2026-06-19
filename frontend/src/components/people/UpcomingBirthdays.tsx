import { useEffect, useState } from 'react';
import { CalendarDays, Award } from 'lucide-react';
import { api } from '../../api';
import { Button, Card, CardBody } from '../ui';

type UpcomingPerson = {
  id: string;
  fullName: string;
  email: string;
  department?: string | null;
  birthday: string;
  workStartDate?: string | null;
  daysUntil?: number;
};

type Tab = 'birthdays' | 'anniversaries';

export default function UpcomingBirthdays() {
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<UpcomingPerson[]>([]);
  const [upcomingAnniversaries, setUpcomingAnniversaries] = useState<UpcomingPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('birthdays');

  useEffect(() => {
    loadUpcoming();
  }, []);

  const loadUpcoming = async () => {
    try {
      const [bdData, annData] = await Promise.all([
        api.call('/people/upcoming'),
        api.call('/people/upcoming-anniversaries').catch(() => ({ upcoming: [] })),
      ]);
      setUpcomingBirthdays(bdData.upcoming || []);
      setUpcomingAnniversaries(annData.upcoming || []);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Unable to load upcoming events.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (error) {
    return (
      <div className="ds-surface p-8 text-center">
        <p className="text-red-600">{error}</p>
        <Button onClick={loadUpcoming} variant="ghost" size="sm" className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const list = tab === 'birthdays' ? upcomingBirthdays : upcomingAnniversaries;
  const emptyMsg =
    tab === 'birthdays'
      ? 'No upcoming birthdays in the next 30 days.'
      : 'No upcoming work anniversaries in the next 30 days.';

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTab('birthdays')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            tab === 'birthdays'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CalendarDays className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
          Birthdays {upcomingBirthdays.length > 0 && `(${upcomingBirthdays.length})`}
        </button>
        <button
          type="button"
          onClick={() => setTab('anniversaries')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            tab === 'anniversaries'
              ? 'bg-purple-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Award className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
          Work anniversaries {upcomingAnniversaries.length > 0 && `(${upcomingAnniversaries.length})`}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="ds-surface p-8 text-center">
          <p className="text-gray-600">{emptyMsg}</p>
        </div>
      ) : (
        list.map((person) => (
          <Card key={`${tab}-${person.id}`}>
            <CardBody>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-medium">{person.fullName}</h3>
                  <p className="text-sm text-gray-600">{person.email}</p>
                  {person.department && (
                    <p className="text-sm text-gray-500 mt-1">{person.department}</p>
                  )}
                </div>
                <div className="text-right">
                  {tab === 'birthdays' ? (
                    <p className="text-2xl font-bold text-blue-600">
                      {new Date(person.birthday).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  ) : (
                    <div>
                      <p className="text-2xl font-bold text-purple-600">
                        {person.workStartDate
                          ? new Date(person.workStartDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </p>
                      {person.workStartDate && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {new Date().getFullYear() -
                            new Date(person.workStartDate).getFullYear()}{' '}
                          yr
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}
