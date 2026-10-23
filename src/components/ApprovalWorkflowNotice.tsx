import { ArrowRight, ShieldCheck } from 'lucide-react';

export default function ApprovalWorkflowNotice({ payment = false }: { payment?: boolean }) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white p-2 text-brand-600 shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-brand-900">One approval. Clear accountability.</p>
          <p className="mt-1 text-sm text-slate-600">
            Every employee can submit a request. One management decision completes approval.
          </p>
          <ol aria-label="Approval workflow" className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-brand-800">
            <li className="rounded-full border border-brand-100 bg-white px-3 py-1">Submit request</li>
            <li aria-hidden="true"><ArrowRight className="h-4 w-4" /></li>
            <li className="rounded-full border border-brand-100 bg-white px-3 py-1">Management approval</li>
            <li aria-hidden="true"><ArrowRight className="h-4 w-4" /></li>
            <li className="rounded-full border border-brand-100 bg-white px-3 py-1">{payment ? 'Payment & settlement' : 'Complete'}</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
