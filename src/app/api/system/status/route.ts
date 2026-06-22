import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth-helpers";
import { safeApiErrorResponse } from "@/lib/api/safe-error";
import { db } from "@/lib/db";
import { getSearchConfigStatus } from "@/lib/prominence/research";

export const dynamic = "force-dynamic";

type CheckState = "ready" | "attention" | "blocked";

interface SystemCheck {
  key: string;
  label: string;
  state: CheckState;
  message: string;
  adminDetail?: string;
}

export async function GET() {
  try {
    await requireApiAdmin();

    const [database, standoutSignalsColumn] = await Promise.all([
      checkDatabase(),
      checkStandoutSignalsColumn(),
    ]);
    const search = getSearchConfigStatus();

    const checks: SystemCheck[] = [
      database,
      standoutSignalsColumn,
      {
        key: "sheets",
        label: "Google Sheets",
        state: hasEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL") &&
          hasEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")
          ? "ready"
          : "attention",
        message: hasEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL") &&
          hasEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")
          ? "Sheet import and sync have credentials configured."
          : "Sheet import needs service account credentials before production use.",
        adminDetail:
          "Requires GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
      },
      {
        key: "resend",
        label: "Resend",
        state: hasEnv("RESEND_API_KEY") && hasEnv("EMAIL_FROM")
          ? "ready"
          : "attention",
        message: hasEnv("RESEND_API_KEY") && hasEnv("EMAIL_FROM")
          ? "Email delivery configuration is present."
          : "Email delivery is not fully configured yet.",
        adminDetail: "Requires RESEND_API_KEY and EMAIL_FROM.",
      },
      {
        key: "vercel-cron",
        label: "Vercel Cron",
        state: hasEnv("CRON_SECRET") ? "ready" : "attention",
        message: hasEnv("CRON_SECRET")
          ? "Background cron requests can be authorized."
          : "Background cron needs CRON_SECRET before production scheduling.",
        adminDetail: "Endpoint: /api/cron/vip-prominence-scan.",
      },
      {
        key: "automation",
        label: "Automation",
        state: hasEnv("AUTOMATION_BRIDGE_TOKEN") ? "ready" : "attention",
        message: hasEnv("AUTOMATION_BRIDGE_TOKEN")
          ? "Automation bridge token configuration is present."
          : "Automation remains usable in draft/admin mode, but the bridge token is not configured.",
        adminDetail:
          "Bridge clients can also use mailbox-specific tokens managed in Automation Center.",
      },
      {
        key: "standout-signals",
        label: "Standout Signals",
        state: search.hasGeminiSearch || search.hasGoogleCustomSearch
          ? "ready"
          : "attention",
        message: search.hasGeminiSearch || search.hasGoogleCustomSearch
          ? "Standout research has a search provider configured."
          : "Standout research needs Gemini or Google Custom Search credentials.",
        adminDetail:
          "Preferred: GEMINI_API_KEY. Fallback: GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID.",
      },
    ];

    return NextResponse.json({
      ok: checks.every((check) => check.state !== "blocked"),
      checks,
    });
  } catch (error: unknown) {
    return safeApiErrorResponse(error, {
      fallbackMessage: "System status is unavailable right now.",
      logPrefix: "System status failed:",
    });
  }
}

async function checkDatabase(): Promise<SystemCheck> {
  try {
    await db.$queryRawUnsafe("SELECT 1");
    return {
      key: "postgresql",
      label: "PostgreSQL",
      state: "ready",
      message: "The database is reachable.",
    };
  } catch (error) {
    return {
      key: "postgresql",
      label: "PostgreSQL",
      state: "blocked",
      message: "The database is not reachable. Admin attention is needed.",
      adminDetail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkStandoutSignalsColumn(): Promise<SystemCheck> {
  try {
    const databaseUrl = process.env.DATABASE_URL || "";
    const isSqlite = databaseUrl.startsWith("file:");
    const rows = isSqlite
      ? await db.$queryRawUnsafe<Array<{ name: string }>>(
          'PRAGMA table_info("Interview")'
        )
      : await db.$queryRawUnsafe<Array<{ column_name: string }>>(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'Interview' AND column_name = 'prominenceSignalsJson'"
        );
    const hasColumn = rows.some((row) =>
      "name" in row
        ? row.name === "prominenceSignalsJson"
        : row.column_name === "prominenceSignalsJson"
    );

    return {
      key: "standout-migration",
      label: "Standout Signals Migration",
      state: hasColumn ? "ready" : "blocked",
      message: hasColumn
        ? "The structured Standout Signals column is available."
        : "The database needs the Standout Signals migration before this feature can run.",
      adminDetail:
        "Expected Interview.prominenceSignalsJson. Run the production Prisma migration if missing.",
    };
  } catch (error) {
    return {
      key: "standout-migration",
      label: "Standout Signals Migration",
      state: "blocked",
      message: "Could not confirm the Standout Signals database migration.",
      adminDetail: error instanceof Error ? error.message : String(error),
    };
  }
}

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}
