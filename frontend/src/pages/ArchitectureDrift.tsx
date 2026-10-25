import { PageContainer, PageHeader } from '@/components/Page';
import { driftViolations } from '@/data/mockData';

const severityStyles: Record<string, string> = {
  High: 'bg-red-50 text-red-700',
  Medium: 'bg-amber-50 text-amber-700',
  Low: 'bg-slate-100 text-slate-600',
};

export default function ArchitectureDrift() {
  return (
    <PageContainer>
      <PageHeader
        title="Architecture Drift"
        description="Detected violations of the intended architectural boundaries."
      />

      <div className="space-y-4">
        {driftViolations.map((v) => (
          <div key={v.id} className="card">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-400">
                    {v.id}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      severityStyles[v.severity] ?? ''
                    }`}
                  >
                    {v.severity}
                  </span>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-slate-900">
                  {v.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {v.description}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-slate-400">
                {v.module}
              </span>
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
