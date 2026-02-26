import { Card, CardBody } from "../../ui";

type AdminPageProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  error?: string;
  children: React.ReactNode;
};

export default function AdminPage({
  title,
  description,
  actions,
  loading = false,
  loadingLabel = "Loading…",
  error,
  children,
}: AdminPageProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      {error ? <div className="ds-alert ds-alert-error">{error}</div> : null}

      {loading ? (
        <Card>
          <CardBody className="p-5 text-sm text-slate-500">{loadingLabel}</CardBody>
        </Card>
      ) : children}
    </div>
  );
}
