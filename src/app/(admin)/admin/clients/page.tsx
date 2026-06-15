import Link from "next/link";
import { ClientList } from "@/components/admin/client-list";

export default function AdminClientsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 mt-1">Manage TLI clients and their interview imports</p>
        </div>
        <Link
          href="/admin/clients/new"
          id="create-client-link"
          className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 sm:self-auto"
        >
          + Create Client
        </Link>
      </div>
      <ClientList />
    </div>
  );
}
