import { useEffect, useState } from "react";
import { adminApi } from "../../../api";
import { Card, CardBody } from "../../ui";
import AdminPage from "../ui/AdminPage";

type OverviewStats = {
  totalOrganizations: number;
  totalUsers: number;
  totalPeople: number;
  emailsSentToday: number;
  emailsSentWeek: number;
  failedDeliveriesToday: number;
  upcomingBirthdays: number;
};

export default function AdminOverview() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await adminApi.call("/overview");
        setStats(data.stats);
      } catch (err: any) {
        setError(err.message || "Failed to load overview");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <AdminPage
      title="Overview"
      description="Platform health snapshot for MomentOS operations."
      loading={loading}
      loadingLabel="Loading overview…"
      error={error}
    >
      {stats ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Organizations", value: stats.totalOrganizations },
            { label: "Users", value: stats.totalUsers },
            { label: "People Records", value: stats.totalPeople },
            { label: "Emails Sent Today", value: stats.emailsSentToday },
            { label: "Emails Sent (7d)", value: stats.emailsSentWeek },
            { label: "Failed Deliveries Today", value: stats.failedDeliveriesToday },
            { label: "Upcoming Birthdays (7d)", value: stats.upcomingBirthdays },
          ].map((item) => (
            <Card key={item.label}>
              <CardBody className="space-y-2 p-5">
                <div className="text-xs uppercase tracking-wider text-slate-400">
                  {item.label}
                </div>
                <div className="text-2xl font-semibold text-slate-900">{item.value}</div>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : null}
    </AdminPage>
  );
}
