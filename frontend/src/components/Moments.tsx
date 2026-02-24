import { useEffect, useMemo, useState } from "react";

type ApiClient = {
  call: (endpoint: string, options?: RequestInit) => Promise<any>;
};

type MomentCategory = {
  key: string;
  label: string;
};

type PersonOption = {
  id: string;
  fullName: string;
  email: string;
};

type TemplateOption = {
  id: string;
  name: string;
  channels?: ("email" | "sms" | "whatsapp")[];
};

type MomentRecord = {
  id: string;
  title: string;
  category: string;
  eventDate: string;
  recurrenceRule: "ONE_TIME" | "ANNUAL" | "CUSTOM";
  deliveryChannels: ("email" | "sms" | "whatsapp")[];
  status: "ACTIVE" | "PAUSED";
  recipients: PersonOption[];
};

type CreateMomentForm = {
  title: string;
  category: string;
  personIds: string[];
  recurrenceRule: "ONE_TIME" | "ANNUAL";
  deliveryChannels: ("email" | "sms" | "whatsapp")[];
  templateId: string;
  eventDate: string;
};

const STEP_LABELS = [
  "Choose category",
  "Select people",
  "Automation type",
  "Customize message",
  "Confirm schedule",
];

const categoryFallback: MomentCategory[] = [
  { key: "BIRTHDAY", label: "Birthdays" },
  { key: "ANNIVERSARY", label: "Anniversaries" },
  { key: "GRADUATION", label: "Graduation" },
  { key: "PROMOTION_CAREER_MILESTONE", label: "Promotion / Career Milestone" },
  { key: "SPIRITUAL_MILESTONE", label: "Spiritual Milestone" },
  { key: "REMEMBRANCE_DAY", label: "Remembrance Day" },
  { key: "CUSTOM", label: "Custom Moment" },
];

const initialForm: CreateMomentForm = {
  title: "",
  category: "BIRTHDAY",
  personIds: [],
  recurrenceRule: "ANNUAL",
  deliveryChannels: ["email"],
  templateId: "",
  eventDate: "",
};

export default function Moments({ api }: { api: ApiClient }) {
  const [categories, setCategories] = useState<MomentCategory[]>(categoryFallback);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [moments, setMoments] = useState<MomentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CreateMomentForm>(initialForm);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.templateId) || null,
    [templates, form.templateId]
  );
  const selectedPeople = useMemo(
    () => people.filter((person) => form.personIds.includes(person.id)),
    [people, form.personIds]
  );

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [categoryData, peopleData, templateData, momentData] = await Promise.all([
        api.call("/moments/categories"),
        api.call("/people"),
        api.call("/templates"),
        api.call("/moments"),
      ]);

      setCategories(categoryData?.categories || categoryFallback);
      setPeople(peopleData?.people || []);
      setTemplates(templateData?.templates || []);
      setMoments(momentData?.moments || []);
    } catch (err: any) {
      setError(err.message || "Failed to load moments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (templates.length > 0 && !form.templateId) {
      setForm((prev) => ({ ...prev, templateId: templates[0].id }));
    }
  }, [templates, form.templateId]);

  const togglePerson = (personId: string) => {
    setForm((prev) => {
      const exists = prev.personIds.includes(personId);
      return {
        ...prev,
        personIds: exists
          ? prev.personIds.filter((id) => id !== personId)
          : [...prev.personIds, personId],
      };
    });
  };

  const toggleChannel = (channel: "email" | "sms" | "whatsapp") => {
    setForm((prev) => {
      const exists = prev.deliveryChannels.includes(channel);
      if (exists) {
        if (prev.deliveryChannels.length === 1) return prev;
        return {
          ...prev,
          deliveryChannels: prev.deliveryChannels.filter((value) => value !== channel),
        };
      }
      return {
        ...prev,
        deliveryChannels: [...prev.deliveryChannels, channel],
      };
    });
  };

  const validateCurrentStep = () => {
    if (step === 1) {
      if (!form.category) return "Choose a category.";
      if (!form.title.trim()) return "Add a title for this moment.";
    }
    if (step === 2 && form.personIds.length === 0) {
      return "Select at least one person.";
    }
    if (step === 3 && form.deliveryChannels.length === 0) {
      return "Select at least one delivery channel.";
    }
    if (step === 4 && !form.templateId) {
      return "Choose a message template.";
    }
    if (step === 5 && !form.eventDate) {
      return "Choose the event date.";
    }
    return null;
  };

  const nextStep = () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setStep((value) => Math.min(5, value + 1));
  };

  const resetForm = () => {
    setForm({
      ...initialForm,
      templateId: templates[0]?.id || "",
    });
    setStep(1);
    setShowCreate(false);
  };

  const createMoment = async () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.call("/moments", {
        method: "POST",
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          personIds: form.personIds,
          recurrenceRule: form.recurrenceRule,
          deliveryChannels: form.deliveryChannels,
          templateId: form.templateId || null,
          eventDate: form.eventDate,
        }),
      });
      setSuccess("Moment created and automation activated.");
      resetForm();
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to create moment.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (moment: MomentRecord, status: "ACTIVE" | "PAUSED") => {
    setError("");
    setSuccess("");
    try {
      await api.call(`/moments/${moment.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setSuccess(`Moment marked as ${status.toLowerCase()}.`);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to update moment.");
    }
  };

  const deleteMoment = async (moment: MomentRecord) => {
    if (!window.confirm(`Delete "${moment.title}"?`)) return;
    setError("");
    setSuccess("");
    try {
      await api.call(`/moments/${moment.id}`, {
        method: "DELETE",
      });
      setSuccess("Moment deleted.");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete moment.");
    }
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <section className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Moments</h2>
            <p className="text-sm text-gray-600">
              Build celebration automation beyond birthdays.
            </p>
          </div>
          <button
            onClick={() => {
              setShowCreate((value) => !value);
              setError("");
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showCreate ? "Close" : "Create Moment"}
          </button>
        </div>

        {showCreate ? (
          <div className="p-6 space-y-5 border-b bg-slate-50">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Step {step} of 5: {STEP_LABELS[step - 1]}
            </div>

            {step === 1 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Category</label>
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, category: event.target.value }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {categories.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Moment title</label>
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="Wedding Anniversary"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-3">
                <div className="text-sm text-slate-600">
                  Select one or more recipients.
                </div>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                  {people.length === 0 ? (
                    <div className="p-4 text-sm text-slate-500">
                      No people found. Add people first.
                    </div>
                  ) : (
                    people.map((person) => (
                      <label
                        key={person.id}
                        className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
                      >
                        <span>
                          {person.fullName}
                          <span className="ml-2 text-slate-500">{person.email}</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={form.personIds.includes(person.id)}
                          onChange={() => togglePerson(person.id)}
                        />
                      </label>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Automation type
                  </label>
                  <select
                    value={form.recurrenceRule}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        recurrenceRule: event.target.value as "ONE_TIME" | "ANNUAL",
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <option value="ANNUAL">Annual recurrence</option>
                    <option value="ONE_TIME">One-time event</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Channels</label>
                  <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                    {(["email", "sms", "whatsapp"] as const).map((channel) => (
                      <label
                        key={channel}
                        className="inline-flex items-center gap-2 capitalize"
                      >
                        <input
                          type="checkbox"
                          checked={form.deliveryChannels.includes(channel)}
                          onChange={() => toggleChannel(channel)}
                        />
                        {channel}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div>
                <label className="text-sm font-medium text-slate-700">Message template</label>
                <select
                  value={form.templateId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, templateId: event.target.value }))
                  }
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  Template selected: {selectedTemplate?.name || "None"}
                </p>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">Event date</label>
                  <input
                    type="date"
                    value={form.eventDate}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, eventDate: event.target.value }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 md:w-64"
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 space-y-1">
                  <div>
                    <span className="font-medium">Category:</span> {form.category}
                  </div>
                  <div>
                    <span className="font-medium">Title:</span> {form.title}
                  </div>
                  <div>
                    <span className="font-medium">Recipients:</span> {selectedPeople.length}
                  </div>
                  <div>
                    <span className="font-medium">Recurrence:</span> {form.recurrenceRule}
                  </div>
                  <div>
                    <span className="font-medium">Channels:</span>{" "}
                    {form.deliveryChannels.join(", ")}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-between">
              <button
                onClick={() => setStep((value) => Math.max(1, value - 1))}
                disabled={step === 1 || saving}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
              >
                Back
              </button>
              {step < 5 ? (
                <button
                  onClick={nextStep}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={createMoment}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Confirm and activate"}
                </button>
              )}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading moments...</div>
        ) : moments.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            No moments created yet. Start with the guided flow above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Recipients</th>
                  <th className="px-4 py-3 text-left">Channels</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {moments.map((moment) => (
                  <tr key={moment.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{moment.title}</td>
                    <td className="px-4 py-3 text-slate-600">{moment.category}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(moment.eventDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{moment.recipients.length}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {moment.deliveryChannels.join(", ")}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{moment.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {moment.status === "ACTIVE" ? (
                          <button
                            onClick={() => updateStatus(moment, "PAUSED")}
                            className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                          >
                            Pause
                          </button>
                        ) : (
                          <button
                            onClick={() => updateStatus(moment, "ACTIVE")}
                            className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                          >
                            Resume
                          </button>
                        )}
                        <button
                          onClick={() => deleteMoment(moment)}
                          className="rounded-md border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
