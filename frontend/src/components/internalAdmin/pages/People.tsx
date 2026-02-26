import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
import { Button, Input, cn } from "../../ui";
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
    setError("");
    try {
      await adminApi.call(`/people/${id}/send-birthday`, { method: "POST" });
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to queue send");
    }
  };

  return (
    <AdminPage
      title="People Records"
      description="Search and debug people records across organizations."
      loading={loading}
      loadingLabel="Loading people…"
      error={error}
      actions={
        <div className="admin-toolbar">
          <Input
            value={filters.email}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, email: event.target.value }))
            }
            placeholder="Search by email"
            className="min-w-[220px]"
          />
          <Input
            value={filters.orgId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, orgId: event.target.value }))
            }
            placeholder="Org ID"
            className="min-w-[160px]"
          />
          <Button onClick={load} variant="secondary">
            Apply
          </Button>
        </div>
      }
    >
      <div className="admin-panel overflow-hidden">
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead className="bg-slate-50">
              <tr>
                <th className="ds-th">Name</th>
                <th className="ds-th">Email</th>
                <th className="ds-th">Phone</th>
                <th className="ds-th">Birthday</th>
                <th className="ds-th">Organization</th>
                <th className="ds-th">Opted Out</th>
                <th className="ds-th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {people.map((person) => (
                <tr key={person.id} className="admin-table-row">
                  <td className="ds-td font-medium text-slate-700">{person.fullName}</td>
                  <td className="ds-td">{person.email}</td>
                  <td className="ds-td">{person.phone || "—"}</td>
                  <td className="ds-td">{new Date(person.birthday).toLocaleDateString()}</td>
                  <td className="ds-td">{person.organization}</td>
                  <td className="ds-td">
                    <span
                      className={cn(
                        "admin-status-pill",
                        person.optedOut ? "admin-status-pill-muted" : "admin-status-pill-success",
                      )}
                    >
                      {person.optedOut ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="ds-td">
                    <div className="flex justify-end">
                      <Button onClick={() => handleSend(person.id)} size="sm" variant="secondary">
                        Send now
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {people.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ds-td py-10 text-center text-slate-500">
                    No people found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPage>
  );
}
