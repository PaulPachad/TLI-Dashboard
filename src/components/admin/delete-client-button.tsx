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
  const [typedName, setTypedName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = typedName.trim() === clientName;

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
      <div className="flex max-w-md flex-col items-end gap-2">
        <label className="w-full text-right text-xs font-medium text-rose-700">
          Type {clientName} to confirm deletion.
          <input
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            disabled={loading}
            className="mt-1 w-full rounded-lg border border-rose-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 disabled:opacity-50"
            autoComplete="off"
          />
        </label>
        <div className="flex items-center gap-2">
          {error && (
            <span role="alert" className="text-xs text-rose-600 mr-2">
              {error}
            </span>
          )}
          <button
            onClick={() => {
              setIsConfirming(false);
              setTypedName("");
              setError(null);
            }}
            disabled={loading}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={loading || !canDelete}
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
      onClick={() => {
        setIsConfirming(true);
        setTypedName("");
      }}
      id="delete-client-btn"
      className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
    >
      Delete Client
    </button>
  );
}
