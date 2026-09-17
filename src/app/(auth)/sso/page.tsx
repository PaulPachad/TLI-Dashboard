"use client";

import { useEffect, useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Single Sign-On (SSO) Receiver Page
 * Receives the signed SSO token from Authority Central and establishes a NextAuth admin session.
 *
 * Strictly NO emojis.
 */
function SsoReceiver() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  const token = searchParams.get("token");
  const dest = searchParams.get("dest") || "/dashboard";

  useEffect(() => {
    if (!token) {
      setError("Missing SSO authentication token.");
      return;
    }

    let isMounted = true;

    async function authenticate() {
      try {
        const result = await signIn("sso", {
          ssoToken: token,
          redirect: false,
        });

        if (!isMounted) return;

        if (result?.error) {
          setError(
            "Single Sign-On authentication was unsuccessful. Please sign in manually."
          );
        } else {
          // Validate destination path to prevent open redirects
          const safeDest =
            dest.startsWith("/") && !dest.startsWith("//") ? dest : "/dashboard";
          router.push(safeDest);
          router.refresh();
        }
      } catch (err) {
        if (isMounted) {
          setError("An error occurred during Single Sign-On authentication.");
        }
      }
    }

    authenticate();

    return () => {
      isMounted = false;
    };
  }, [token, dest, router]);

  return (
    <div className="mx-auto w-full max-w-md animate-fade-in text-center">
      <div className="rounded-2xl border border-white/60 bg-white/95 p-8 shadow-2xl shadow-slate-950/30 backdrop-blur">
        {error ? (
          <div>
            <div className="mb-4 text-sm font-semibold text-rose-600">{error}</div>
            <a
              href={`/login?callbackUrl=${encodeURIComponent(dest)}`}
              className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              Sign In Manually
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <h2 className="text-lg font-semibold text-slate-900">
              Connecting from Authority Central...
            </h2>
            <p className="text-xs text-slate-500">
              Verifying administrative credentials and opening your workspace.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SsoPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-md text-center text-white">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
        </div>
      }
    >
      <SsoReceiver />
    </Suspense>
  );
}
