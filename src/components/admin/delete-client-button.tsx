"use client";

// ==============================================================================
// Delete Client Button — Admin deletes a client with confirmation
// ==============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeleteClientButtonProps {
  clientId: string;
  clientName: string;
}

export function DeleteClientButton({ clientId, clientName }: DeleteClientButtonProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/clients/${clientId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete client.");
      }

      // Redirect back to clients list
      router.push("/admin/clients");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
      setLoading(false);
    }
  }

  if (isConfirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-rose-600 mr-2">{error}</span>}
          <button
            onClick={() => setIsConfirming(false)}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            id="confirm-delete-client-btn"
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Deleting..." : "Confirm Delete"}
          </button>
        </div>
        <p className="text-xs text-rose-600 font-medium">
          Warning: This deletes all user accounts, sheet sources, and interviews for {clientName}.
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsConfirming(true)}
      id="delete-client-btn"
      className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
    >
      Delete Client
    </button>
  );
}
