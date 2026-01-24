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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {description ? (
            <p className="text-sm text-slate-500 mt-1">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500">{loadingLabel}</div>
      ) : (
        children
      )}
    </div>
  );
}
