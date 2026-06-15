import { InterviewGrid } from "@/components/dashboard/interview-grid";
import { requireAuth } from "@/lib/auth-helpers";

export default async function DashboardHomePage() {
  await requireAuth();

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Your Published Interviews
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Track and leverage your Authority Magazine interviews
        </p>
      </div>

      <InterviewGrid />
    </div>
  );
}
