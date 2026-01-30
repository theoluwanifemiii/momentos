import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
import AdminPage from "../ui/AdminPage";

type PersonRow = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  birthday: string;
  optedOut: boolean;
  organization: string;
  createdAt: string;
};

export default function AdminPeople() {
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ email: "", orgId: "" });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.email) params.set("email", filters.email);
      if (filters.orgId) params.set("orgId", filters.orgId);
      const data = await adminApi.call(`/people?${params.toString()}`);
      setPeople(data.people || []);
    } catch (err: any) {
      setError(err.message || "Failed to load people");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSend = async (id: string) => {
    await adminApi.call(`/people/${id}/send-birthday`, { method: "POST" });
    load();
  };

  return (
    <AdminPage
      title="People Records"
      description="Search and debug people records across organizations."
      loading={loading}
      loadingLabel="Loading people…"
      error={error}
      actions={
        <>
          <input
            value={filters.email}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, email: event.target.value }))
            }
            placeholder="Search by email"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <input
            value={filters.orgId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, orgId: event.target.value }))
            }
            placeholder="Org ID"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={load}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Apply
          </button>
        </>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3 text-left">Birthday</th>
              <th className="px-4 py-3 text-left">Organization</th>
              <th className="px-4 py-3 text-left">Opted Out</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {people.map((person) => (
              <tr key={person.id}>
                <td className="px-4 py-3 text-slate-700">{person.fullName}</td>
                <td className="px-4 py-3 text-slate-600">{person.email}</td>
                <td className="px-4 py-3 text-slate-600">{person.phone || "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {new Date(person.birthday).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-slate-600">{person.organization}</td>
                <td className="px-4 py-3">
                  {person.optedOut ? (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      Yes
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      No
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleSend(person.id)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Send now
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {people.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  No people found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
