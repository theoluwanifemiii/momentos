import { useEffect, useState } from 'react';
import { api } from '../../api';

// People: list records, manual add, and send birthday email now.
export default function PeopleList() {
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendMessage, setSendMessage] = useState('');
  const [listError, setListError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    birthday: '',
    department: '',
    role: '',
  });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadPeople();
  }, []);

  const loadPeople = async () => {
    try {
      const data = await api.call('/people');
      setPeople(data.people);
      setSelectedIds([]);
      setListError('');
    } catch (err) {
      console.error(err);
      setListError('Unable to load people. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendBirthday = async (personId: string) => {
    setSendMessage('');
    setSendingId(personId);
    try {
      await api.call(`/people/${personId}/send-birthday`, { method: 'POST' });
      setSendMessage('Birthday email sent.');
    } catch (err: any) {
      setSendMessage(err.message);
    } finally {
      setSendingId(null);
    }
  };

  const handleAddPerson = async () => {
    setFormError('');
    if (!form.firstName || !form.lastName || !form.email || !form.birthday) {
      setFormError('First name, last name, email, and birthday are required.');
      return;
    }

    try {
      await api.call('/people', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          email: form.email,
          birthday: form.birthday,
          department: form.department || undefined,
          role: form.role || undefined,
        }),
      });
      setForm({
        firstName: '',
        lastName: '',
        email: '',
        birthday: '',
        department: '',
        role: '',
      });
      setShowAddModal(false);
      loadPeople();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/people/export', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Export failed');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'people.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setSendMessage(err.message);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === people.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(people.map((person) => person.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm('Delete selected people?')) return;

    try {
      await api.call('/people/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      setSendMessage('Selected people deleted.');
      loadPeople();
    } catch (err: any) {
      setSendMessage(err.message);
    }
  };

  const handleBulkOptOut = async (optedOut: boolean) => {
    if (selectedIds.length === 0) return;

    try {
      await api.call('/people/bulk-opt-out', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, optedOut }),
      });
      setSendMessage(optedOut ? 'Selected people opted out.' : 'Selected people opted in.');
      loadPeople();
    } catch (err: any) {
      setSendMessage(err.message);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (listError) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center">
        <p className="text-red-600">{listError}</p>
        <button
          onClick={loadPeople}
          className="mt-4 text-blue-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center">
        <p className="text-gray-600">No people added yet. Upload a CSV or add one manually.</p>
        <button
          onClick={() => setShowAddModal(true)}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
        >
          Add Person
        </button>
        {showAddModal && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowAddModal(false)}
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                  <h3 className="text-lg font-bold">Add Person</h3>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Close
                  </button>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">First Name</label>
                      <input
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Last Name</label>
                      <input
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Last name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Email</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="person@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Birthday</label>
                      <input
                        type="date"
                        value={form.birthday}
                        onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Department</label>
                      <input
                        value={form.department}
                        onChange={(e) => setForm({ ...form, department: e.target.value })}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Department"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Role</label>
                      <input
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Role"
                      />
                    </div>
                  </div>

                  {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 rounded text-sm text-gray-700 border hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddPerson}
                      className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                    >
                      Add Person
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-700">{sendMessage}</div>
        <div className="flex flex-wrap items-center gap-3">
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-gray-600">{selectedIds.length} selected</span>
              <button
                onClick={() => handleBulkOptOut(true)}
                className="text-blue-600 hover:underline"
              >
                Bulk opt-out
              </button>
              <button
                onClick={() => handleBulkOptOut(false)}
                className="text-blue-600 hover:underline"
              >
                Bulk opt-in
              </button>
              <button
                onClick={handleBulkDelete}
                className="text-red-600 hover:underline"
              >
                Delete selected
              </button>
            </div>
          )}
          <button
            onClick={handleExport}
            className="text-sm text-blue-600 hover:underline"
          >
            Export CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            Add Person
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                <input
                  type="checkbox"
                  checked={selectedIds.length === people.length && people.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Birthday</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {people.map((person) => (
              <tr key={person.id}>
                <td className="px-4 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(person.id)}
                    onChange={() => toggleSelect(person.id)}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{person.fullName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{person.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {new Date(person.birthday).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {person.department || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => handleSendBirthday(person.id)}
                    disabled={sendingId === person.id}
                    className="text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {sendingId === person.id ? 'Sending...' : 'Send Birthday Email Now'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAddModal && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowAddModal(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white rounded-lg shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="text-lg font-bold">Add Person</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Close
                </button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">First Name</label>
                    <input
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Last Name</label>
                    <input
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Last name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="person@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Birthday</label>
                    <input
                      type="date"
                      value={form.birthday}
                      onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Department</label>
                    <input
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Department"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Role</label>
                    <input
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Role"
                    />
                  </div>
                </div>

                {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

                <div className="mt-4 flex justify-end gap-3">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded text-sm text-gray-700 border hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddPerson}
                    className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                  >
                    Add Person
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
