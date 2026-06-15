import Link from "next/link";
import { ClientForm } from "@/components/admin/client-form";

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/clients"
          className="text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          ← Back to Clients
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Create New Client</h1>
        <p className="text-slate-500 mt-1">Set up a new TLI client account</p>
      </div>
      <ClientForm />
    </div>
  );
}
