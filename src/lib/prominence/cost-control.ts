import { db } from "@/lib/db";

export type StandoutResearchTrigger = "MANUAL" | "QUIET_SCAN" | "CRON";

export type StandoutResearchCostLimitCode =
  | "STANDOUT_RESEARCH_DISABLED"
  | "STANDOUT_AUTOMATIC_RESEARCH_DISABLED"
  | "STANDOUT_RESEARCH_DAILY_LIMIT"
  | "STANDOUT_RESEARCH_MONTHLY_LIMIT";

export interface StandoutResearchCostConfig {
  enabled: boolean;
  automaticEnabled: boolean;
  dailyLimit: number;
  monthlyLimit: number;
}

export interface StandoutResearchCostGateInput {
  trigger: StandoutResearchTrigger;
  dailyCount: number;
  monthlyCount: number;
  config?: StandoutResearchCostConfig;
}

export interface StandoutResearchCostGateResult {
  allowed: boolean;
  code?: StandoutResearchCostLimitCode;
  message?: string;
  status?: number;
}

export interface StandoutResearchAllowance {
  remaining: number;
  dailyCount: number;
  monthlyCount: number;
  config: StandoutResearchCostConfig;
}

export class StandoutResearchCostLimitError extends Error {
  code: StandoutResearchCostLimitCode;
  status: number;

  constructor(result: Required<Pick<StandoutResearchCostGateResult, "code" | "message" | "status">>) {
    super(result.message);
    this.name = "StandoutResearchCostLimitError";
    this.code = result.code;
    this.status = result.status;
  }
}

export function getStandoutResearchCostConfig(
  env: Record<string, string | undefined> = process.env
): StandoutResearchCostConfig {
  return {
    enabled: parseEnvBoolean(env.STANDOUT_RESEARCH_ENABLED, true),
    automaticEnabled: parseEnvBoolean(
      env.STANDOUT_RESEARCH_AUTOMATIC_ENABLED,
      true
    ),
    dailyLimit: parseEnvLimit(env.STANDOUT_RESEARCH_DAILY_LIMIT, 25),
    monthlyLimit: parseEnvLimit(env.STANDOUT_RESEARCH_MONTHLY_LIMIT, 250),
  };
}

export function evaluateStandoutResearchCostGate({
  trigger,
  dailyCount,
  monthlyCount,
  config = getStandoutResearchCostConfig(),
}: StandoutResearchCostGateInput): StandoutResearchCostGateResult {
  if (!config.enabled) {
    return {
      allowed: false,
      code: "STANDOUT_RESEARCH_DISABLED",
      message: "Standout research is paused to control cost.",
      status: 503,
    };
  }

  if (trigger !== "MANUAL" && !config.automaticEnabled) {
    return {
      allowed: false,
      code: "STANDOUT_AUTOMATIC_RESEARCH_DISABLED",
      message: "Automatic Standout research is paused to control cost.",
      status: 503,
    };
  }

  if (dailyCount >= config.dailyLimit) {
    return {
      allowed: false,
      code: "STANDOUT_RESEARCH_DAILY_LIMIT",
      message: "Today's Standout research limit has been reached.",
      status: 429,
    };
  }

  if (monthlyCount >= config.monthlyLimit) {
    return {
      allowed: false,
      code: "STANDOUT_RESEARCH_MONTHLY_LIMIT",
      message: "This month's Standout research limit has been reached.",
      status: 429,
    };
  }

  return { allowed: true };
}

export async function assertStandoutResearchAllowed(
  trigger: StandoutResearchTrigger,
  now = new Date()
) {
  await getStandoutResearchAllowance(trigger, now);
}

export async function getStandoutResearchAllowance(
  trigger: StandoutResearchTrigger,
  now = new Date()
): Promise<StandoutResearchAllowance> {
  const [dailyCount, monthlyCount] = await Promise.all([
    countStandoutResearchSince(startOfDay(now)),
    countStandoutResearchSince(startOfMonth(now)),
  ]);
  const config = getStandoutResearchCostConfig();

  const result = evaluateStandoutResearchCostGate({
    trigger,
    dailyCount,
    monthlyCount,
    config,
  });

  if (!result.allowed && result.code && result.message && result.status) {
    throw new StandoutResearchCostLimitError({
      code: result.code,
      message: result.message,
      status: result.status,
    });
  }

  return {
    remaining: Math.min(
      Math.max(config.dailyLimit - dailyCount, 0),
      Math.max(config.monthlyLimit - monthlyCount, 0)
    ),
    dailyCount,
    monthlyCount,
    config,
  };
}

function countStandoutResearchSince(createdAt: Date) {
  return db.action.count({
    where: {
      actionType: "PROMINENCE_RESEARCHED",
      createdAt: { gte: createdAt },
    },
  });
}

function startOfDay(value: Date): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    0,
    0,
    0,
    0
  );
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

function parseEnvBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  return !/^(false|0|no|off)$/i.test(value.trim());
}

function parseEnvLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.trunc(parsed), 0);
}
