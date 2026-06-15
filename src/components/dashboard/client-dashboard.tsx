"use client";

import { useState } from "react";
import { SheetImportForm } from "@/components/admin/sheet-import-form";
import { InterviewGrid } from "./interview-grid";

interface ClientDashboardProps {
  clientId: string;
}

export function ClientDashboard({ clientId }: ClientDashboardProps) {
  const [interviewRefreshKey, setInterviewRefreshKey] = useState(0);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Import or Sync Your Google Sheet
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Add your published Authority Magazine interviews directly to your dashboard.
          </p>
        </div>
        <SheetImportForm
          clientId={clientId}
          onImportComplete={() =>
            setInterviewRefreshKey((current) => current + 1)
          }
        />
      </section>

      <section>
        <h2 className="sr-only">Published interviews</h2>
        <InterviewGrid key={interviewRefreshKey} />
      </section>
    </div>
  );
}
