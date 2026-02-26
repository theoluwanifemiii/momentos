import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Button, Card, CardBody } from '../ui';

// People: show upcoming birthdays for the next 30 days.
export default function UpcomingBirthdays() {
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUpcoming();
  }, []);

  const loadUpcoming = async () => {
    try {
      const data = await api.call('/people/upcoming');
      setUpcoming(data.upcoming);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Unable to load upcoming birthdays.');
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
        <Button
          onClick={loadUpcoming}
          variant="ghost"
          size="sm"
          className="mt-4"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (upcoming.length === 0) {
    return (
      <div className="ds-surface p-8 text-center">
        <p className="text-gray-600">No upcoming birthdays in the next 30 days.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {upcoming.map((person) => (
        <Card key={person.id}>
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
              <p className="text-2xl font-bold text-blue-600">
                {new Date(person.birthday).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
