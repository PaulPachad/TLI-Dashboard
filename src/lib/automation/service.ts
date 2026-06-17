import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import {
  AUTOMATION_PROFILE_NAME,
  DEFAULT_AUTOMATION_MAILBOXES,
  DEFAULT_AUTOMATION_TEMPLATES,
  DEFAULT_SUPPRESSIONS,
} from "@/lib/automation/defaults";

export interface AutomationSettingsInput {
  isEnabled?: boolean;
  globalKillSwitch?: boolean;
  mode?: string;
  checkIntervalSeconds?: number;
  maxEmailsPerRun?: number;
  matchThreshold?: number;
  multipleChoiceGap?: number;
  maxMatches?: number;
  activeTopicLimit?: number | null;
  topicSourceType?: string;
  topicSourceUrl?: string | null;
  formSheetUrl?: string | null;
  blockedSenders?: string[];
  blockedDomains?: string[];
  skipPhrases?: string[];
  mailboxes?: Array<{
    id: string;
    label?: string;
    emailAddress?: string;
    isEnabled?: boolean;
    authStatus?: string;
  }>;
}

export interface TemplateInput {
  id: string;
  subject?: string | null;
  body: string;
  isEnabled?: boolean;
}

export interface BridgeLogInput {
  runId?: string;
  status?: string;
  workflowType?: string;
  recipient?: string;
  subject?: string;
  gmailThreadId?: string;
  gmailMessageId?: string;
  matchedTopic?: string;
  matchedUrl?: string;
  matchScore?: number;
  templateKey?: string;
  reason?: string;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

const TOKEN_PREFIX = "am_bridge";

export function hashBridgeToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createBridgeToken(mailboxId: string) {
  const secret = randomBytes(24).toString("base64url");
  return `${TOKEN_PREFIX}_${mailboxId}_${secret}`;
}

export function tokenPreview(token: string) {
  return `...${token.slice(-6)}`;
}

export function isSameTokenHash(token: string, expectedHash: string) {
  const actual = Buffer.from(hashBridgeToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function toJsonList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return toJsonList(parsed);
    } catch {
      return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function jsonField(value: unknown) {
  return value as never;
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export async function ensureAutomationProfile() {
  let profile = await db.automationProfile.findFirst({
    orderBy: { createdAt: "asc" },
    include: {
      mailboxes: { orderBy: { createdAt: "asc" } },
      templates: { orderBy: { createdAt: "asc" } },
      suppressions: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!profile) {
    profile = await db.automationProfile.create({
      data: {
        name: AUTOMATION_PROFILE_NAME,
        description:
          "Draft-only control center for Authority Magazine email automation.",
        mode: "DRAFT_ONLY",
        matchThreshold: 90,
        multipleChoiceGap: 6,
        maxMatches: 3,
        blockedSendersJson: jsonField([]),
        blockedDomainsJson: jsonField([]),
        skipPhrasesJson: jsonField(DEFAULT_SUPPRESSIONS.map((item) => item.value)),
        mailboxes: {
          create: DEFAULT_AUTOMATION_MAILBOXES.map((mailbox) => ({
            ...mailbox,
            isEnabled: false,
          })),
        },
        templates: {
          create: DEFAULT_AUTOMATION_TEMPLATES.map((template) => ({
            templateKey: template.templateKey,
            name: template.name,
            subject: template.subject,
            body: template.body,
            allowedVariablesJson: jsonField(template.allowedVariables),
          })),
        },
        suppressions: {
          create: DEFAULT_SUPPRESSIONS.map((entry) => ({
            kind: entry.kind,
            value: entry.value,
            reason: entry.reason,
          })),
        },
      } as never,
      include: {
        mailboxes: { orderBy: { createdAt: "asc" } },
        templates: { orderBy: { createdAt: "asc" } },
        suppressions: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  await ensureMissingDefaults(profile.id);

  return db.automationProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: {
      mailboxes: { orderBy: { createdAt: "asc" } },
      templates: { orderBy: { createdAt: "asc" } },
      suppressions: { orderBy: { createdAt: "asc" } },
    },
  });
}

async function ensureMissingDefaults(profileId: string) {
  for (const mailbox of DEFAULT_AUTOMATION_MAILBOXES) {
    await db.automationMailbox.upsert({
      where: {
        profileId_emailAddress: {
          profileId,
          emailAddress: mailbox.emailAddress,
        },
      },
      update: {},
      create: {
        profileId,
        ...mailbox,
        isEnabled: false,
      },
    });
  }

  for (const template of DEFAULT_AUTOMATION_TEMPLATES) {
    await db.automationTemplate.upsert({
      where: {
        profileId_templateKey: {
          profileId,
          templateKey: template.templateKey,
        },
      },
      update: {},
      create: {
        profileId,
        templateKey: template.templateKey,
        name: template.name,
        subject: template.subject,
        body: template.body,
        allowedVariablesJson: jsonField(template.allowedVariables),
      } as never,
    });
  }
}

export async function getAutomationOverview() {
  const profile = await ensureAutomationProfile();
  const [recentRuns, draftLogs, learnedRules] = await Promise.all([
    db.automationRun.findMany({
      where: { profileId: profile.id },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { mailbox: true },
    }),
    db.automationDraftLog.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { mailbox: true },
    }),
    db.learnedRule.findMany({
      where: { profileId: profile.id },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
  ]);

  return { profile, recentRuns, draftLogs, learnedRules };
}

export async function updateAutomationSettings(input: AutomationSettingsInput) {
  const profile = await ensureAutomationProfile();
  const updated = await db.automationProfile.update({
    where: { id: profile.id },
    data: {
      isEnabled: Boolean(input.isEnabled),
      globalKillSwitch: Boolean(input.globalKillSwitch),
      mode: "DRAFT_ONLY",
      checkIntervalSeconds: clampInt(
        input.checkIntervalSeconds,
        profile.checkIntervalSeconds,
        30,
        3600
      ),
      maxEmailsPerRun: clampInt(input.maxEmailsPerRun, profile.maxEmailsPerRun, 1, 250),
      matchThreshold: clampInt(input.matchThreshold, profile.matchThreshold, 50, 100),
      multipleChoiceGap: clampInt(input.multipleChoiceGap, profile.multipleChoiceGap, 0, 50),
      maxMatches: clampInt(input.maxMatches, profile.maxMatches, 1, 10),
      activeTopicLimit:
        input.activeTopicLimit === null || input.activeTopicLimit === undefined
          ? null
          : clampInt(input.activeTopicLimit, profile.activeTopicLimit || 200, 1, 10000),
      topicSourceType: String(input.topicSourceType || profile.topicSourceType || "LOCAL_JSON"),
      topicSourceUrl: String(input.topicSourceUrl || "").trim() || null,
      formSheetUrl: String(input.formSheetUrl || "").trim() || null,
      blockedSendersJson: jsonField(toJsonList(input.blockedSenders)),
      blockedDomainsJson: jsonField(toJsonList(input.blockedDomains)),
      skipPhrasesJson: jsonField(toJsonList(input.skipPhrases)),
      configVersion: { increment: 1 },
    } as never,
  });

  if (Array.isArray(input.mailboxes)) {
    for (const mailbox of input.mailboxes) {
      await db.automationMailbox.update({
        where: { id: mailbox.id },
        data: {
          label: String(mailbox.label || "").trim() || undefined,
          emailAddress: String(mailbox.emailAddress || "").trim().toLowerCase() || undefined,
          isEnabled: Boolean(mailbox.isEnabled),
          authStatus: String(mailbox.authStatus || "UNKNOWN"),
        },
      });
    }
  }

  return updated;
}

export function validateTemplateVariables(body: string, subject: string | null | undefined, allowed: string[]) {
  const content = `${subject || ""}\n${body || ""}`;
  const used = [...content.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]);
  return used.filter((variable) => !allowed.includes(variable));
}

export async function updateAutomationTemplates(input: TemplateInput[]) {
  const profile = await ensureAutomationProfile();
  const templates = await db.automationTemplate.findMany({
    where: { profileId: profile.id },
  });
  const byId = new Map(templates.map((template) => [template.id, template]));

  for (const item of input) {
    const current = byId.get(item.id);
    if (!current) continue;
    const allowed = toJsonList(current.allowedVariablesJson);
    const invalid = validateTemplateVariables(item.body, item.subject, allowed);
    if (invalid.length > 0) {
      throw new Error(
        `${current.name} uses unsupported variable(s): ${[...new Set(invalid)].join(", ")}`
      );
    }
    await db.automationTemplate.update({
      where: { id: item.id },
      data: {
        subject: String(item.subject || "").trim() || null,
        body: String(item.body || "").trim(),
        isEnabled: item.isEnabled !== false,
        version: { increment: 1 },
      },
    });
  }

  await db.automationProfile.update({
    where: { id: profile.id },
    data: { configVersion: { increment: 1 } },
  });
}

export async function rotateMailboxBridgeToken(mailboxId: string) {
  await ensureAutomationProfile();
  const token = createBridgeToken(mailboxId);
  const updated = await db.automationMailbox.update({
    where: { id: mailboxId },
    data: {
      bridgeTokenHash: hashBridgeToken(token),
      bridgeTokenPreview: tokenPreview(token),
      bridgeTokenRotatedAt: new Date(),
      bridgeStatus: "TOKEN_READY",
    },
  });
  return { token, mailbox: updated };
}

export async function getMailboxForBridgeToken(token: string) {
  const hash = hashBridgeToken(token);
  const mailbox = await db.automationMailbox.findUnique({
    where: { bridgeTokenHash: hash },
    include: { profile: { include: { templates: true, suppressions: true } } },
  });
  if (!mailbox?.bridgeTokenHash || !isSameTokenHash(token, mailbox.bridgeTokenHash)) {
    return null;
  }
  return mailbox;
}

export async function createBridgeRun(mailboxId: string, status = "RUNNING") {
  const mailbox = await db.automationMailbox.findUniqueOrThrow({ where: { id: mailboxId } });
  return db.automationRun.create({
    data: {
      profileId: mailbox.profileId,
      mailboxId: mailbox.id,
      status,
      trigger: "BRIDGE",
    },
  });
}

export async function recordBridgeStatus(
  mailboxId: string,
  input: {
    authStatus?: string;
    bridgeStatus?: string;
    lastError?: string | null;
    run?: {
      status?: string;
      emailsScanned?: number;
      draftsCreated?: number;
      skippedCount?: number;
      warningCount?: number;
      errorCount?: number;
      summary?: string;
      metadata?: Record<string, unknown>;
    };
  }
) {
  const mailbox = await db.automationMailbox.update({
    where: { id: mailboxId },
    data: {
      authStatus: String(input.authStatus || "UNKNOWN"),
      bridgeStatus: String(input.bridgeStatus || "CONNECTED"),
      lastHeartbeatAt: new Date(),
      lastError: input.lastError ? String(input.lastError).slice(0, 1000) : null,
    },
  });

  let run = null;
  if (input.run) {
    run = await db.automationRun.create({
      data: {
        profileId: mailbox.profileId,
        mailboxId: mailbox.id,
        status: input.run.status || "SUCCESS",
        finishedAt: new Date(),
        emailsScanned: clampInt(input.run.emailsScanned, 0, 0, 10000),
        draftsCreated: clampInt(input.run.draftsCreated, 0, 0, 10000),
        skippedCount: clampInt(input.run.skippedCount, 0, 0, 10000),
        warningCount: clampInt(input.run.warningCount, 0, 0, 10000),
        errorCount: clampInt(input.run.errorCount, 0, 0, 10000),
        summary: input.run.summary ? String(input.run.summary).slice(0, 1000) : null,
        metadataJson: jsonField(input.run.metadata || {}),
      } as never,
    });
    await db.automationMailbox.update({
      where: { id: mailbox.id },
      data: { lastRunAt: new Date() },
    });
  }

  return { mailbox, run };
}

export async function recordBridgeDraftLog(mailboxId: string, input: BridgeLogInput) {
  const mailbox = await db.automationMailbox.findUniqueOrThrow({
    where: { id: mailboxId },
    include: { profile: true },
  });
  return db.automationDraftLog.create({
    data: {
      profileId: mailbox.profileId,
      mailboxId: mailbox.id,
      runId: input.runId || null,
      workflowType: input.workflowType || mailbox.workflowType,
      status: input.status || "DRAFT_CREATED",
      recipient: input.recipient ? String(input.recipient).slice(0, 320) : null,
      subject: input.subject ? String(input.subject).slice(0, 500) : null,
      gmailThreadId: input.gmailThreadId ? String(input.gmailThreadId).slice(0, 200) : null,
      gmailMessageId: input.gmailMessageId ? String(input.gmailMessageId).slice(0, 200) : null,
      matchedTopic: input.matchedTopic ? String(input.matchedTopic).slice(0, 500) : null,
      matchedUrl: input.matchedUrl ? String(input.matchedUrl).slice(0, 1000) : null,
      matchScore: input.matchScore === undefined ? null : clampInt(input.matchScore, 0, 0, 100),
      templateKey: input.templateKey ? String(input.templateKey).slice(0, 120) : null,
      configVersion: mailbox.profile.configVersion,
      reason: input.reason ? String(input.reason).slice(0, 1000) : null,
      snippet: input.snippet ? String(input.snippet).slice(0, 1000) : null,
      metadataJson: jsonField(input.metadata || {}),
    } as never,
  });
}
