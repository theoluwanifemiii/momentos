import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api';
import { OnboardingState } from '../../types/onboarding';
import NextStepPanel from '../onboarding/NextStepPanel';
import OnboardingBanner from '../onboarding/OnboardingBanner';
import { Button, Card, CardBody, CardHeader } from '../ui';
import PersonProfileModal from './PersonProfileModal';

// People: list records, manual add, and send birthday email now.
type PeopleListProps = {
  allowManualSend?: boolean;
  onboarding: OnboardingState | null;
  onOnboardingUpdate: (next: OnboardingState) => void;
  onSelectTab?: (tab: 'people' | 'templates' | 'settings' | 'upcoming' | 'dashboard') => void;
};

export default function PeopleList({
  allowManualSend = false,
  onboarding,
  onOnboardingUpdate,
  onSelectTab,
}: PeopleListProps) {
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingAction, setSendingAction] = useState<string | null>(null);
  const [sendMessage, setSendMessage] = useState('');
  const [listError, setListError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthday: '',
    workStartDate: '',
    department: '',
    role: '',
  });
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<{
    person: any;
    top: number;
    left: number;
  } | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthday: '',
    workStartDate: '',
    department: '',
    role: '',
  });
  const [editFormError, setEditFormError] = useState('');
  const [profilePerson, setProfilePerson] = useState<any | null>(null);

  useEffect(() => {
    loadPeople();
  }, []);

  useEffect(() => {
    const closeActionMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-action-menu-root="true"]')) {
        return;
      }
      setActionMenu(null);
    };

    const closeOnViewportChange = () => setActionMenu(null);

    window.addEventListener('click', closeActionMenu);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      window.removeEventListener('click', closeActionMenu);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
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

  const handleSend = async (personId: string, channel: 'email' | 'sms' | 'all') => {
    setSendMessage('');
    setSendingAction(`${personId}:${channel}`);
    try {
      await api.call(`/people/${personId}/send-birthday`, {
        method: 'POST',
        body: JSON.stringify({ channel }),
      });
      const label = channel === 'all' ? 'Email & SMS' : channel === 'email' ? 'Email' : 'SMS';
      setSendMessage(`Birthday ${label} sent.`);
    } catch (err: any) {
      setSendMessage(err.message);
    } finally {
      setSendingAction(null);
    }
  };

  const handleAddPerson = async () => {
    setFormError('');
    if (!form.firstName || !form.lastName || !form.email || !form.birthday) {
      setFormError('First name, last name, email, and birthday are required.');
      return;
    }

    try {
      const data = await api.call('/people', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          email: form.email,
          phone: form.phone || undefined,
          birthday: form.birthday,
          workStartDate: form.workStartDate || undefined,
          department: form.department || undefined,
          role: form.role || undefined,
        }),
      });
      if (data.onboarding) {
        onOnboardingUpdate(data.onboarding);
        const nextStep =
          data.onboarding.steps?.find((step: any) => step.id === data.onboarding.currentStepId) ||
          data.onboarding.steps?.find((step: any) => step.status === 'active');
        if (nextStep) {
          setSuccessMessage(`✅ Person added successfully. Next: ${nextStep.title}.`);
        } else {
          setSuccessMessage('✅ Person added successfully.');
        }
      }
      setForm({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        birthday: '',
        workStartDate: '',
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

  const openEditModal = (person: any) => {
    const fullName = (person.fullName || '').trim();
    const fallbackFirstName = fullName.split(/\s+/).filter(Boolean)[0] || '';
    const firstName = (person.firstName || '').trim() || fallbackFirstName;
    const lastName = firstName
      ? fullName.slice(firstName.length).trim()
      : fullName.split(/\s+/).slice(1).join(' ');
    const birthdayDate = new Date(person.birthday);
    const workStartDate = person.workStartDate ? new Date(person.workStartDate) : null;

    setEditingPersonId(person.id);
    setEditForm({
      firstName,
      lastName,
      email: person.email || '',
      phone: person.phone || '',
      birthday: Number.isNaN(birthdayDate.getTime())
        ? ''
        : birthdayDate.toISOString().slice(0, 10),
      workStartDate: workStartDate && !Number.isNaN(workStartDate.getTime())
        ? workStartDate.toISOString().slice(0, 10)
        : '',
      department: person.department || '',
      role: person.role || '',
    });
    setEditFormError('');
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingPersonId(null);
    setEditFormError('');
  };

  const handleUpdatePerson = async () => {
    if (!editingPersonId) return;

    setEditFormError('');
    if (!editForm.firstName || !editForm.lastName || !editForm.email || !editForm.birthday) {
      setEditFormError('First name, last name, email, and birthday are required.');
      return;
    }

    try {
      await api.call(`/people/${editingPersonId}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName: editForm.firstName || undefined,
          fullName: `${editForm.firstName} ${editForm.lastName}`.trim(),
          email: editForm.email,
          phone: editForm.phone || null,
          birthday: editForm.birthday,
          workStartDate: editForm.workStartDate || null,
          department: editForm.department || undefined,
          role: editForm.role || undefined,
        }),
      });

      setSendMessage('Person details updated.');
      closeEditModal();
      await loadPeople();
    } catch (err: any) {
      setEditFormError(err.message || 'Failed to update person.');
    }
  };

  const toggleActionMenu = (person: any, trigger: HTMLButtonElement) => {
    setActionMenu((current) => {
      if (current && String(current.person?.id) === String(person?.id)) {
        return null;
      }

      const rect = trigger.getBoundingClientRect();
      const menuWidth = 176; // ui-dropdown width (w-44)
      const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
      const left = Math.max(8, Math.min(maxLeft, rect.right + 8));
      const top = Math.max(8, Math.min(window.innerHeight - 160, rect.top));

      return {
        person,
        top,
        left,
      };
    });
  };

  const actionPerson = actionMenu?.person ?? null;

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (listError) {
    return (
      <div className="ds-surface p-8 text-center">
        <p className="text-red-600">{listError}</p>
        <Button
          onClick={loadPeople}
          variant="ghost"
          size="sm"
          className="mt-4"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="space-y-4">
        {successMessage && (
          <OnboardingBanner
            title="Success"
            message={successMessage}
            onDismiss={() => setSuccessMessage('')}
          />
        )}
        <NextStepPanel onboarding={onboarding} onSelectTab={onSelectTab} />
        <div className="ds-surface p-8 text-center">
          <p className="text-gray-600">No people added yet. Upload a CSV or add one manually.</p>
          <Button
            onClick={() => setShowAddModal(true)}
            className="mt-4"
          >
            Add Person
          </Button>
          {showAddModal && (
            <div className="ds-modal-shell">
              <div
                className="ds-modal-backdrop"
                onClick={() => setShowAddModal(false)}
              />
              <div className="ds-modal-position">
                <div className="ds-modal-panel">
                  <div className="ds-modal-header">
                    <h3 className="text-lg font-bold">Add Person</h3>
                    <Button
                      onClick={() => setShowAddModal(false)}
                      variant="ghost"
                      size="sm"
                    >
                      Close
                    </Button>
                  </div>
                  <div className="ds-card-body">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="ds-label">First Name</label>
                        <input
                          value={form.firstName}
                          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                          className="ds-input"
                          placeholder="First name"
                        />
                      </div>
                      <div>
                        <label className="ds-label">Last Name</label>
                        <input
                          value={form.lastName}
                          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                          className="ds-input"
                          placeholder="Last name"
                        />
                      </div>
                      <div>
                        <label className="ds-label">Email</label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          className="ds-input"
                          placeholder="person@example.com"
                        />
                      </div>
                      <div>
                        <label className="ds-label">Phone</label>
                        <input
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                          className="ds-input"
                          placeholder="+15551234567"
                        />
                      </div>
                      <div>
                        <label className="ds-label">Birthday</label>
                        <input
                          type="date"
                          value={form.birthday}
                          onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                          className="ds-input"
                        />
                      </div>
                      <div>
                        <label className="ds-label">Work start date <span className="text-slate-400 font-normal">(optional)</span></label>
                        <input
                          type="date"
                          value={form.workStartDate}
                          onChange={(e) => setForm({ ...form, workStartDate: e.target.value })}
                          className="ds-input"
                        />
                      </div>
                      <div>
                        <label className="ds-label">Department</label>
                        <input
                          value={form.department}
                          onChange={(e) => setForm({ ...form, department: e.target.value })}
                          className="ds-input"
                          placeholder="Department"
                        />
                      </div>
                      <div>
                        <label className="ds-label">Role</label>
                        <input
                          value={form.role}
                          onChange={(e) => setForm({ ...form, role: e.target.value })}
                          className="ds-input"
                          placeholder="Role"
                        />
                      </div>
                    </div>

                    {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

                    <div className="mt-4 flex justify-end gap-3">
                      <Button
                        onClick={() => setShowAddModal(false)}
                        variant="secondary"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddPerson}
                      >
                        Add Person
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {successMessage && (
        <OnboardingBanner
          title="Success"
          message={successMessage}
          onDismiss={() => setSuccessMessage('')}
        />
      )}
      <NextStepPanel onboarding={onboarding} onSelectTab={onSelectTab} />
      <Card className="overflow-hidden shadow-none">
        <CardHeader className="flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-700">{sendMessage}</div>
          <div className="flex flex-wrap items-center gap-3">
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-gray-600">{selectedIds.length} selected</span>
                <button
                  onClick={() => handleBulkOptOut(true)}
                  className="ds-link"
                >
                  Bulk opt-out
                </button>
                <button
                  onClick={() => handleBulkOptOut(false)}
                  className="ds-link"
                >
                  Bulk opt-in
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Delete selected
                </button>
              </div>
            )}
            <Button
              onClick={handleExport}
              variant="ghost"
              size="sm"
            >
              Export CSV
            </Button>
            <Button
              onClick={() => setShowAddModal(true)}
            >
              Add Person
            </Button>
          </div>
        </CardHeader>
      <CardBody className="p-0">
      <div className="ds-table-wrap">
        <table className="min-w-[980px] w-full ds-table">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                <input
                  type="checkbox"
                  checked={selectedIds.length === people.length && people.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="ds-th">Name</th>
              <th className="ds-th">Email</th>
              <th className="ds-th">Phone</th>
              <th className="ds-th">Birthday</th>
              <th className="ds-th">Department</th>
              <th className="ds-th">Role</th>
              <th className="ds-th">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {people.map((person) => (
              <tr
                key={person.id}
                className="cursor-pointer transition-colors hover:bg-slate-50"
                onClick={() => setProfilePerson(person)}
              >
                <td className="px-4 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(person.id)}
                    onChange={() => toggleSelect(person.id)}
                    onClick={(event) => event.stopPropagation()}
                  />
                </td>
                <td className="ds-td">{person.fullName}</td>
                <td className="ds-td text-gray-600">{person.email}</td>
                <td className="ds-td text-gray-600">
                  {person.phone || '—'}
                </td>
                <td className="ds-td">
                  {new Date(person.birthday).toLocaleDateString()}
                </td>
                <td className="ds-td text-gray-600">
                  {person.department || '—'}
                </td>
                <td className="ds-td">
                  {person.role ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setProfilePerson(person);
                      }}
                      className="ds-link text-sm"
                    >
                      {person.role}
                    </button>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="ds-td">
                  <div className="relative inline-block text-left" data-action-menu-root="true">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleActionMenu(person, e.currentTarget);
                      }}
                      className={`ds-icon-trigger ${
                        actionMenu && String(actionMenu.person?.id) === String(person.id)
                          ? 'bg-gray-50 text-gray-700'
                          : ''
                      }`}
                      aria-label="Open row actions"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <circle cx="3" cy="8" r="1.25" />
                        <circle cx="8" cy="8" r="1.25" />
                        <circle cx="13" cy="8" r="1.25" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </CardBody>
      {showAddModal && (
        <div className="ds-modal-shell">
          <div
            className="ds-modal-backdrop"
            onClick={() => setShowAddModal(false)}
          />
          <div className="ds-modal-position">
            <div className="ds-modal-panel">
              <div className="ds-modal-header">
                <h3 className="text-lg font-bold">Add Person</h3>
                <Button
                  onClick={() => setShowAddModal(false)}
                  variant="ghost"
                  size="sm"
                >
                  Close
                </Button>
              </div>
              <div className="ds-card-body">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="ds-label">First Name</label>
                    <input
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      className="ds-input"
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Last Name</label>
                    <input
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      className="ds-input"
                      placeholder="Last name"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="ds-input"
                      placeholder="person@example.com"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Phone</label>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="ds-input"
                      placeholder="+15551234567"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Birthday</label>
                    <input
                      type="date"
                      value={form.birthday}
                      onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                      className="ds-input"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Work start date <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input
                      type="date"
                      value={form.workStartDate}
                      onChange={(e) => setForm({ ...form, workStartDate: e.target.value })}
                      className="ds-input"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Department</label>
                    <input
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      className="ds-input"
                      placeholder="Department"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Role</label>
                    <input
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="ds-input"
                      placeholder="Role"
                    />
                  </div>
                </div>

                {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

                <div className="mt-4 flex justify-end gap-3">
                  <Button
                    onClick={() => setShowAddModal(false)}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddPerson}
                  >
                    Add Person
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {actionMenu && actionPerson && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="ds-dropdown"
              style={{ top: actionMenu.top, left: actionMenu.left }}
              onClick={(e) => e.stopPropagation()}
              data-action-menu-root="true"
            >
              <button
                onClick={() => {
                  openEditModal(actionPerson);
                  setActionMenu(null);
                }}
                className="ds-dropdown-item"
              >
                Edit Person
              </button>
              <button
                onClick={() => { setActionMenu(null); handleSend(actionPerson.id, 'email'); }}
                disabled={!allowManualSend || sendingAction === `${actionPerson.id}:email`}
                className="ds-dropdown-item"
              >
                {sendingAction === `${actionPerson.id}:email` ? 'Sending Email...' : 'Send Birthday Email'}
              </button>
              <button
                onClick={() => { setActionMenu(null); handleSend(actionPerson.id, 'sms'); }}
                disabled={!allowManualSend || !actionPerson.phone || sendingAction === `${actionPerson.id}:sms`}
                className="ds-dropdown-item"
              >
                {sendingAction === `${actionPerson.id}:sms` ? 'Sending SMS...' : 'Send Birthday SMS'}
              </button>
              <button
                onClick={() => { setActionMenu(null); handleSend(actionPerson.id, 'all'); }}
                disabled={!allowManualSend || !actionPerson.phone || sendingAction === `${actionPerson.id}:all`}
                className="ds-dropdown-item"
              >
                {sendingAction === `${actionPerson.id}:all` ? 'Sending All...' : 'Send All (Email + SMS)'}
              </button>
            </div>,
            document.body
          )
        : null}
      {showEditModal && (
        <div className="ds-modal-shell">
          <div
            className="ds-modal-backdrop"
            onClick={closeEditModal}
          />
          <div className="ds-modal-position">
            <div className="ds-modal-panel">
              <div className="ds-modal-header">
                <h3 className="text-lg font-bold">Edit Person</h3>
                <Button
                  onClick={closeEditModal}
                  variant="ghost"
                  size="sm"
                >
                  Close
                </Button>
              </div>
              <div className="ds-card-body">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="ds-label">First Name</label>
                    <input
                      value={editForm.firstName}
                      onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                      className="ds-input"
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Last Name</label>
                    <input
                      value={editForm.lastName}
                      onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                      className="ds-input"
                      placeholder="Last name"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Email</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="ds-input"
                      placeholder="person@example.com"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Phone</label>
                    <input
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="ds-input"
                      placeholder="+15551234567"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Birthday</label>
                    <input
                      type="date"
                      value={editForm.birthday}
                      onChange={(e) => setEditForm({ ...editForm, birthday: e.target.value })}
                      className="ds-input"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Work start date <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input
                      type="date"
                      value={editForm.workStartDate}
                      onChange={(e) => setEditForm({ ...editForm, workStartDate: e.target.value })}
                      className="ds-input"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Department</label>
                    <input
                      value={editForm.department}
                      onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                      className="ds-input"
                      placeholder="Department"
                    />
                  </div>
                  <div>
                    <label className="ds-label">Role</label>
                    <input
                      value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                      className="ds-input"
                      placeholder="Role"
                    />
                  </div>
                </div>

                {editFormError && <p className="mt-3 text-sm text-red-600">{editFormError}</p>}

                <div className="mt-4 flex justify-end gap-3">
                  <Button
                    onClick={closeEditModal}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpdatePerson}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {profilePerson ? (
        <PersonProfileModal
          api={api}
          person={profilePerson}
          onClose={() => setProfilePerson(null)}
        />
      ) : null}
      </Card>
    </div>
  );
}
