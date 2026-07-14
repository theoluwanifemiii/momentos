import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest("[data-send-menu]")) {
        setOpenMenuId(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const toggleMenu = (personId: string, trigger: HTMLButtonElement) => {
    if (openMenuId === personId) {
      setOpenMenuId(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 176;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const top = Math.max(8, Math.min(window.innerHeight - 120, rect.bottom + 4));
    setMenuPos({ top, left });
    setOpenMenuId(personId);
  };

  const handleSend = async (id: string, channel: "email" | "sms" | "all") => {
    setOpenMenuId(null);
    setError("");
    setSendingId(`${id}:${channel}`);
    try {
      await adminApi.call(`/people/${id}/send-birthday`, {
        method: "POST",
        body: JSON.stringify({ channel }),
      });
    } catch (err: any) {
      setError(err.message || "Send failed");
    } finally {
      setSendingId(null);
    }
  };

  const activePerson = openMenuId ? people.find((p) => p.id === openMenuId) : null;

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
                    <div className="flex justify-end" data-send-menu="true">
                      <button
                        type="button"
                        data-send-menu="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMenu(person.id, e.currentTarget);
                        }}
                        disabled={!!sendingId}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          openMenuId === person.id
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {sendingId?.startsWith(person.id) ? "Sending…" : "Send"}
                        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
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

      {openMenuId && activePerson && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              data-send-menu="true"
              className="ds-dropdown"
              style={{ top: menuPos.top, left: menuPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="ds-dropdown-item"
                onClick={() => handleSend(activePerson.id, "email")}
              >
                Send Birthday Email
              </button>
              <button
                className="ds-dropdown-item"
                disabled={!activePerson.phone}
                onClick={() => handleSend(activePerson.id, "sms")}
                title={!activePerson.phone ? "No phone number on record" : undefined}
              >
                Send Birthday SMS
              </button>
              <button
                className="ds-dropdown-item"
                disabled={!activePerson.phone}
                onClick={() => handleSend(activePerson.id, "all")}
                title={!activePerson.phone ? "No phone number on record" : undefined}
              >
                Send All (Email + SMS)
              </button>
            </div>,
            document.body,
          )
        : null}
    </AdminPage>
  );
}
