import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import {
  AUTOMATION_PROFILE_NAME,
  DEFAULT_AUTOMATION_MAILBOXES,
  DEFAULT_AUTOMATION_TEMPLATES,
  DEFAULT_AUTOMATION_WORKFLOW_SETTINGS,
  DEFAULT_SUPPRESSIONS,
} from "@/lib/automation/defaults";

export interface WorkflowSettingsInput {
  isEnabled?: boolean;
  mode?: string;
  timezone?: string;
  scheduleHour?: number;
  scheduleMinute?: number;
  queueLabelId?: string | null;
  queueLabelName?: string | null;
  dailyCap?: number;
  batchSize?: number;
}

export interface EnqueueCandidateInput {
  gmailThreadId: string;
  gmailMessageId?: string;
  sourceMessageIds?: string[];
  anchorInboundId?: string;
  recipient: string;
  subject?: string;
  templateVersion?: number;
  templateHash?: string;
  deterministicMessageId?: string;
}

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
  if ((process.env.DATABASE_URL || "").startsWith("file:")) {
    return JSON.stringify(value) as never;
  }
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
      workflows: { include: { mailbox: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!profile) {
    profile = await db.automationProfile.create({
      data: {
        name: AUTOMATION_PROFILE_NAME,
        description:
          "Operational control center for Authority Magazine email automation.",
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
        workflows: { include: { mailbox: true }, orderBy: { createdAt: "asc" } },
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
      workflows: { include: { mailbox: true }, orderBy: { createdAt: "asc" } },
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
    const existing = await db.automationTemplate.findUnique({
      where: {
        profileId_templateKey: {
          profileId,
          templateKey: template.templateKey,
        },
      },
    });

    if (!existing) {
      await db.automationTemplate.create({
        data: {
          profileId,
          templateKey: template.templateKey,
          name: template.name,
          subject: template.subject,
          body: template.body,
          allowedVariablesJson: jsonField(template.allowedVariables),
        } as never,
      });
    } else {
      // Auto-migrate legacy templates that don't have the modern desktop text
      const isLegacyNoMatch =
        existing.templateKey === "pitch_no_match" &&
        !existing.body.includes("chatgpt.com");
      const isLegacyMultiple =
        existing.templateKey === "pitch_multiple_match" &&
        !existing.body.includes("FAQandInstructions");
      const isLegacyCollabNoMatch =
        existing.templateKey === "collab_no_match" &&
        existing.body.includes("Can you send a little more detail");

      if (isLegacyNoMatch || isLegacyMultiple || isLegacyCollabNoMatch) {
        await db.automationTemplate.update({
          where: { id: existing.id },
          data: {
            body: template.body,
            name: template.name,
            subject: template.subject,
            allowedVariablesJson: jsonField(template.allowedVariables),
            version: { increment: 1 },
          },
        });
      }
    }
  }

  // Ensure default workflows for editor mailbox
  const editorMailbox = await db.automationMailbox.findFirst({
    where: {
      profileId,
      emailAddress: "editor@authoritymag.co",
    },
  });

  if (editorMailbox) {
    for (const wf of DEFAULT_AUTOMATION_WORKFLOW_SETTINGS) {
      const existing = await db.automationWorkflow.findUnique({
        where: {
          mailboxId_key: {
            mailboxId: editorMailbox.id,
            key: wf.key,
          },
        },
      });

      if (!existing) {
        await db.automationWorkflow.create({
          data: {
            profileId,
            mailboxId: editorMailbox.id,
            key: wf.key,
            name: wf.name,
            description: wf.description,
            isEnabled: wf.isEnabled,
            mode: wf.mode,
            timezone: wf.timezone,
            scheduleHour: wf.scheduleHour,
            scheduleMinute: wf.scheduleMinute,
            queueLabelName: wf.queueLabelName,
            templateKey: wf.templateKey,
            templateVersion: wf.templateVersion,
            dailyCap: wf.dailyCap,
            batchSize: wf.batchSize,
          },
        });
      }
    }
  }
}

export async function getAutomationOverview() {
  const profile = await ensureAutomationProfile();
  const [recentRuns, draftLogs, learnedRules, recentWorkflowRuns, recentDeliveries] = await Promise.all([
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
    db.automationWorkflowRun.findMany({
      where: { profileId: profile.id },
      orderBy: { scheduledAt: "desc" },
      take: 20,
      include: { workflow: true, mailbox: true },
    }),
    db.automationDelivery.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { workflow: true },
    }),
  ]);

  return { profile, recentRuns, draftLogs, learnedRules, recentWorkflowRuns, recentDeliveries };
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
    include: {
      workflows: true,
      profile: {
        include: {
          templates: true,
          suppressions: true,
          workflows: true,
        },
      },
    },
  });
  if (!mailbox?.bridgeTokenHash || !isSameTokenHash(token, mailbox.bridgeTokenHash)) {
    return null;
  }
  return mailbox;
}

export async function createBridgeRun(
  mailboxId: string,
  status = "RUNNING",
  summary?: string | null,
  metadata?: Record<string, unknown>
) {
  const mailbox = await db.automationMailbox.findUniqueOrThrow({ where: { id: mailboxId } });
  return db.automationRun.create({
    data: {
      profileId: mailbox.profileId,
      mailboxId: mailbox.id,
      status,
      trigger: "BRIDGE",
      summary: summary ? String(summary).slice(0, 1000) : null,
      metadataJson: jsonField(metadata || {}),
    } as never,
  });
}

export async function recordBridgeStatus(
  mailboxId: string,
  input: {
    authStatus?: string;
    bridgeStatus?: string;
    lastError?: string | null;
    run?: {
      id?: string;
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
    const runData = {
      status: input.run.status || "SUCCESS",
      finishedAt: new Date(),
      emailsScanned: clampInt(input.run.emailsScanned, 0, 0, 100000),
      draftsCreated: clampInt(input.run.draftsCreated, 0, 0, 100000),
      skippedCount: clampInt(input.run.skippedCount, 0, 0, 100000),
      warningCount: clampInt(input.run.warningCount, 0, 0, 100000),
      errorCount: clampInt(input.run.errorCount, 0, 0, 100000),
      summary: input.run.summary ? String(input.run.summary).slice(0, 1000) : null,
      metadataJson: jsonField(input.run.metadata || {}),
    };

    if (input.run.id) {
      run = await db.automationRun.update({
        where: { id: input.run.id },
        data: runData as never,
      });
    } else {
      run = await db.automationRun.create({
        data: {
          profileId: mailbox.profileId,
          mailboxId: mailbox.id,
          trigger: "BRIDGE",
          ...runData,
        } as never,
      });
    }
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

export async function syncBridgeLearnedRules(
  profileId: string,
  rules: Array<{
    original_topic?: string;
    originalTopic?: string;
    normalized_topic?: string;
    normalizedTopic?: string;
    correct_topic_name?: string;
    correctTopicName?: string;
    correct_doc_id?: string | null;
    correctDocId?: string | null;
    match_type?: string;
    source?: string;
    confidence?: number | null;
  }>
) {
  let count = 0;
  for (const rule of rules) {
    const original = String(rule.originalTopic || rule.original_topic || "").trim();
    const correct = String(rule.correctTopicName || rule.correct_topic_name || "").trim();
    if (!original || !correct) continue;
    const normalized =
      String(rule.normalizedTopic || rule.normalized_topic || "").trim().toLowerCase() ||
      original.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

    const rawConf = rule.confidence != null ? Number(rule.confidence) : 100;
    const confidence = rawConf <= 1.0 ? Math.round(rawConf * 100) : Math.round(rawConf);

    await db.learnedRule.upsert({
      where: {
        profileId_normalizedTopic: {
          profileId,
          normalizedTopic: normalized,
        },
      },
      update: {
        originalTopic: original,
        correctTopicName: correct,
        correctDocId: rule.correctDocId || rule.correct_doc_id || null,
        confidence,
        isEnabled: true,
      },
      create: {
        profileId,
        originalTopic: original,
        normalizedTopic: normalized,
        correctTopicName: correct,
        correctDocId: rule.correctDocId || rule.correct_doc_id || null,
        matchType: rule.match_type || "learned",
        source: rule.source || "local_autoresponder",
        confidence,
        isEnabled: true,
      },
    });
    count++;
  }
  return { success: true, count };
}

export async function syncBridgeTemplates(
  profileId: string,
  templates: Array<{
    templateKey?: string;
    key?: string;
    name?: string;
    subject?: string;
    body: string;
    allowedVariables?: string[];
  }>
) {
  let count = 0;
  for (const item of templates) {
    const key = String(item.templateKey || item.key || "").trim();
    const body = String(item.body || "").trim();
    if (!key || !body) continue;

    const existing = await db.automationTemplate.findUnique({
      where: {
        profileId_templateKey: {
          profileId,
          templateKey: key,
        },
      },
    });

    if (existing) {
      // SaaS is authoritative: preserve user edits in SaaS and do not overwrite with desktop defaults.
      continue;
    } else {
      await db.automationTemplate.create({
        data: {
          profileId,
          templateKey: key,
          name: item.name || key,
          subject: item.subject || null,
          body,
          allowedVariablesJson: jsonField(item.allowedVariables || ["signature"]),
        } as never,
      });
      count++;
    }
  }

  if (count > 0) {
    await db.automationProfile.update({
      where: { id: profileId },
      data: { configVersion: { increment: 1 } },
    });
  }

  return { success: true, count };
}

export async function claimDailyWorkflowRun(
  mailboxId: string,
  workflowKey: string,
  localDate: string,
  leaseOwner: string
) {
  const mailbox = await db.automationMailbox.findUnique({
    where: { id: mailboxId },
    include: { profile: true },
  });
  if (!mailbox) {
    return { error: "Mailbox not found" };
  }

  const workflow = await db.automationWorkflow.findUnique({
    where: {
      mailboxId_key: {
        mailboxId,
        key: workflowKey,
      },
    },
  });

  if (!workflow) {
    return { error: `Workflow '${workflowKey}' not found for this mailbox` };
  }

  const profile = mailbox.profile;
  const isProfileActive = profile.isEnabled && !profile.globalKillSwitch;
  const isWorkflowActive = workflow.isEnabled && mailbox.isEnabled && isProfileActive;

  const now = new Date();
  let run = await db.automationWorkflowRun.findUnique({
    where: {
      workflowId_localDate: {
        workflowId: workflow.id,
        localDate,
      },
    },
  });

  if (!run) {
    run = await db.automationWorkflowRun.create({
      data: {
        profileId: profile.id,
        mailboxId,
        workflowId: workflow.id,
        localDate,
        scheduledAt: now,
        status: "RUNNING",
        leaseOwner,
        leaseExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        leaseGeneration: 1,
      },
    });
  } else {
    if (
      run.leaseExpiresAt &&
      run.leaseExpiresAt > now &&
      run.leaseOwner &&
      run.leaseOwner !== leaseOwner
    ) {
      return {
        status: "LEASE_BUSY",
        message: `Run is claimed by '${run.leaseOwner}' until ${run.leaseExpiresAt.toISOString()}`,
        run,
        workflow,
      };
    }

    run = await db.automationWorkflowRun.update({
      where: { id: run.id },
      data: {
        status: run.status === "SCHEDULED" ? "RUNNING" : run.status,
        leaseOwner,
        leaseExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        leaseGeneration: { increment: 1 },
      },
    });
  }

  return {
    success: true,
    workflow: {
      id: workflow.id,
      key: workflow.key,
      name: workflow.name,
      mode: workflow.mode,
      isEnabled: workflow.isEnabled,
      active: isWorkflowActive,
      queueLabelId: workflow.queueLabelId,
      queueLabelName: workflow.queueLabelName,
      templateKey: workflow.templateKey,
      dailyCap: workflow.dailyCap,
      batchSize: workflow.batchSize,
    },
    run: {
      id: run.id,
      localDate: run.localDate,
      status: run.status,
      leaseGeneration: run.leaseGeneration,
    },
  };
}

export async function enqueueDeliveryCandidates(
  workflowId: string,
  runId: string,
  candidates: EnqueueCandidateInput[]
) {
  const workflow = await db.automationWorkflow.findUnique({
    where: { id: workflowId },
  });
  if (!workflow) {
    return { error: "Workflow not found" };
  }

  let enqueued = 0;
  for (const candidate of candidates) {
    const existing = await db.automationDelivery.findUnique({
      where: {
        workflowId_gmailThreadId: {
          workflowId,
          gmailThreadId: candidate.gmailThreadId,
        },
      },
    });

    if (!existing) {
      await db.automationDelivery.create({
        data: {
          profileId: workflow.profileId,
          workflowId,
          runId,
          gmailThreadId: candidate.gmailThreadId,
          gmailMessageId: candidate.gmailMessageId || null,
          sourceMessageIdsJson: jsonField(candidate.sourceMessageIds || []),
          anchorInboundId: candidate.anchorInboundId || null,
          recipient: candidate.recipient,
          subject: candidate.subject || null,
          templateVersion: candidate.templateVersion || workflow.templateVersion,
          templateHash: candidate.templateHash || null,
          deterministicMessageId: candidate.deterministicMessageId || null,
          state: "PENDING",
        } as never,
      });
      enqueued++;
    } else if (existing.state !== "SENT" && existing.state !== "CLEANED") {
      await db.automationDelivery.update({
        where: { id: existing.id },
        data: {
          runId,
          state: "PENDING",
        },
      });
      enqueued++;
    }
  }

  await db.automationWorkflowRun.update({
    where: { id: runId },
    data: {
      discoveryComplete: true,
      emailsScanned: { increment: candidates.length },
    },
  });

  const deliveries = await db.automationDelivery.findMany({
    where: { runId },
    select: { id: true, gmailThreadId: true },
  });

  return { success: true, enqueued, deliveries };
}

export async function claimDelivery(
  workflowId: string,
  deliveryId: string,
  leaseOwner: string
) {
  const delivery = await db.automationDelivery.findUnique({
    where: { id: deliveryId },
    include: { workflow: { include: { profile: true, mailbox: true } } },
  });
  if (!delivery || delivery.workflowId !== workflowId) {
    return { error: "Delivery not found" };
  }

  const workflow = delivery.workflow;
  const profile = workflow.profile;
  const isProfileActive = profile.isEnabled && !profile.globalKillSwitch;
  const isWorkflowActive = workflow.isEnabled && workflow.mailbox.isEnabled && isProfileActive;

  if (workflow.mode !== "SEND") {
    return { error: "Workflow is in PREVIEW mode; live sends are blocked" };
  }

  if (!isWorkflowActive) {
    return { error: "Workflow or mailbox is currently paused/disabled in SaaS" };
  }

  if (delivery.state !== "PENDING" && delivery.state !== "RETRYABLE") {
    return { error: `Delivery is in state '${delivery.state}', cannot claim for send` };
  }

  const updated = await db.automationDelivery.update({
    where: { id: deliveryId },
    data: {
      state: "SENDING",
      attempts: { increment: 1 },
    },
  });

  return { success: true, delivery: updated };
}

export async function recordDeliveryOutcome(
  deliveryId: string,
  input: {
    state: string;
    gmailSentId?: string | null;
    errorMessage?: string | null;
  }
) {
  const updated = await db.automationDelivery.update({
    where: { id: deliveryId },
    data: {
      state: input.state,
      gmailSentId: input.gmailSentId || null,
      errorMessage: input.errorMessage || null,
      sentAt: input.state === "SENT" ? new Date() : undefined,
    },
  });

  if (updated.runId) {
    const counterField =
      input.state === "SENT"
        ? { sentCount: { increment: 1 } }
        : input.state === "HELD"
        ? { heldCount: { increment: 1 } }
        : input.state === "SUPPRESSED"
        ? { skippedCount: { increment: 1 } }
        : { errorCount: { increment: 1 } };

    await db.automationWorkflowRun.update({
      where: { id: updated.runId },
      data: counterField,
    });
  }

  return { success: true, delivery: updated };
}

export async function completeDeliveryCleanup(deliveryId: string) {
  const updated = await db.automationDelivery.update({
    where: { id: deliveryId },
    data: {
      state: "CLEANED",
      cleanedAt: new Date(),
    },
  });
  return { success: true, delivery: updated };
}

export async function updateWorkflowSettings(
  workflowId: string,
  input: WorkflowSettingsInput
) {
  const updated = await db.automationWorkflow.update({
    where: { id: workflowId },
    data: {
      isEnabled: input.isEnabled !== undefined ? Boolean(input.isEnabled) : undefined,
      mode: input.mode || undefined,
      timezone: input.timezone || undefined,
      scheduleHour: input.scheduleHour !== undefined ? Number(input.scheduleHour) : undefined,
      scheduleMinute: input.scheduleMinute !== undefined ? Number(input.scheduleMinute) : undefined,
      queueLabelId: input.queueLabelId !== undefined ? input.queueLabelId : undefined,
      queueLabelName: input.queueLabelName !== undefined ? input.queueLabelName : undefined,
      dailyCap: input.dailyCap !== undefined ? Number(input.dailyCap) : undefined,
      batchSize: input.batchSize !== undefined ? Number(input.batchSize) : undefined,
      configVersion: { increment: 1 },
    },
  });
  return updated;
}


