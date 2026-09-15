"use client";

import { useMemo, useState } from "react";

type TabId =
  | "mailboxes"
  | "generic"
  | "templates"
  | "rules"
  | "learning"
  | "activity"
  | "test";

interface AutomationCenterProps {
  initialData: AutomationOverview;
}

interface AutomationOverview {
  profile: AutomationProfile;
  recentRuns: AutomationRun[];
  draftLogs: AutomationDraftLog[];
  learnedRules: LearnedRule[];
  recentWorkflowRuns?: AutomationWorkflowRun[];
  recentDeliveries?: AutomationDelivery[];
}

interface AutomationWorkflow {
  id: string;
  profileId: string;
  mailboxId: string;
  key: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  mode: string;
  timezone: string;
  scheduleHour: number;
  scheduleMinute: number;
  queueLabelId: string | null;
  queueLabelName: string | null;
  templateKey: string;
  templateVersion: number;
  dailyCap: number;
  batchSize: number;
  configVersion: number;
  mailbox?: AutomationMailbox | null;
}

interface AutomationWorkflowRun {
  id: string;
  profileId: string;
  mailboxId: string | null;
  workflowId: string;
  localDate: string;
  scheduledAt: string;
  cutoffAt: string | null;
  status: string;
  discoveryComplete: boolean;
  cursor: string | null;
  emailsScanned: number;
  sentCount: number;
  heldCount: number;
  skippedCount: number;
  errorCount: number;
  summary: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  leaseGeneration: number;
  workflow?: AutomationWorkflow | null;
  mailbox?: AutomationMailbox | null;
}

interface AutomationDelivery {
  id: string;
  profileId: string;
  workflowId: string;
  runId: string | null;
  gmailThreadId: string;
  gmailMessageId: string | null;
  anchorInboundId: string | null;
  recipient: string;
  subject: string | null;
  templateVersion: number;
  deterministicMessageId: string | null;
  gmailDraftId: string | null;
  gmailSentId: string | null;
  state: string;
  attempts: number;
  errorMessage: string | null;
  cleanedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  workflow?: AutomationWorkflow | null;
}

interface AutomationProfile {
  id: string;
  name: string;
  isEnabled: boolean;
  globalKillSwitch: boolean;
  mode: string;
  checkIntervalSeconds: number;
  maxEmailsPerRun: number;
  matchThreshold: number;
  multipleChoiceGap: number;
  maxMatches: number;
  activeTopicLimit: number | null;
  topicSourceType: string;
  topicSourceUrl: string | null;
  formSheetUrl: string | null;
  blockedSendersJson: unknown;
  blockedDomainsJson: unknown;
  skipPhrasesJson: unknown;
  configVersion: number;
  mailboxes: AutomationMailbox[];
  templates: AutomationTemplate[];
  suppressions: SuppressionEntry[];
  workflows?: AutomationWorkflow[];
}

interface AutomationMailbox {
  id: string;
  label: string;
  emailAddress: string;
  workflowType: string;
  isEnabled: boolean;
  authStatus: string;
  bridgeStatus: string;
  lastHeartbeatAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  bridgeTokenPreview: string | null;
  bridgeTokenRotatedAt: string | null;
}

interface AutomationTemplate {
  id: string;
  templateKey: string;
  name: string;
  subject: string | null;
  body: string;
  allowedVariablesJson: unknown;
  isEnabled: boolean;
  version: number;
}

interface SuppressionEntry {
  id: string;
  kind: string;
  value: string;
  reason: string | null;
  isEnabled: boolean;
}

interface AutomationRun {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  emailsScanned: number;
  draftsCreated: number;
  skippedCount: number;
  warningCount: number;
  errorCount: number;
  summary: string | null;
  mailbox?: AutomationMailbox | null;
}

interface AutomationDraftLog {
  id: string;
  workflowType: string;
  status: string;
  recipient: string | null;
  subject: string | null;
  matchedTopic: string | null;
  matchScore: number | null;
  templateKey: string | null;
  reason: string | null;
  snippet: string | null;
  createdAt: string;
  mailbox?: AutomationMailbox | null;
}

interface LearnedRule {
  id: string;
  originalTopic: string;
  correctTopicName: string;
  correctDocId: string | null;
  confidence: number | null;
  isEnabled: boolean;
  updatedAt: string;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "mailboxes", label: "Mailboxes & Controls" },
  { id: "generic", label: "Daily Generic Response" },
  { id: "templates", label: "Templates" },
  { id: "rules", label: "Safety Rules" },
  { id: "learning", label: "Learning & Intelligence" },
  { id: "activity", label: "Activity" },
  { id: "test", label: "Test Lab" },
];

export function AutomationCenter({ initialData }: AutomationCenterProps) {
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<TabId>("mailboxes");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [learningSearch, setLearningSearch] = useState("");
  const [testInput, setTestInput] = useState({
    subject: "Pitch: 5 Things You Need To Know To Successfully Run A Live Virtual Event",
    sender: "Publicist <publicist@example.com>",
    body:
      "Dear Authority Magazine Editors\n\nWhat is the name of the interview topic: 5 Things You Need To Know To Successfully Run A Live Virtual Event\nWhat is the best email to follow up with you: publicist@example.com",
  });
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [confirmingRuleId, setConfirmingRuleId] = useState<string | null>(null);

  const profile = data.profile;

  const filteredRules = useMemo(() => {
    if (!learningSearch.trim()) return data.learnedRules;
    const q = learningSearch.toLowerCase();
    return data.learnedRules.filter(
      (rule) =>
        rule.originalTopic.toLowerCase().includes(q) ||
        rule.correctTopicName.toLowerCase().includes(q)
    );
  }, [data.learnedRules, learningSearch]);

  const stats = useMemo(() => {
    const drafts = data.draftLogs.filter((log) => log.status === "DRAFT_CREATED").length;
    const errors = data.recentRuns.reduce((sum, run) => sum + run.errorCount, 0);
    const connected = profile.mailboxes.filter((mailbox) => mailbox.bridgeStatus !== "NEVER_CONNECTED").length;
    return { drafts, errors, connected };
  }, [data.draftLogs, data.recentRuns, profile.mailboxes]);

  function updateProfile(partial: Partial<AutomationProfile>) {
    setData((current) => ({
      ...current,
      profile: { ...current.profile, ...partial },
    }));
  }

  function updateMailbox(id: string, partial: Partial<AutomationMailbox>) {
    setData((current) => ({
      ...current,
      profile: {
        ...current.profile,
        mailboxes: current.profile.mailboxes.map((mailbox) =>
          mailbox.id === id ? { ...mailbox, ...partial } : mailbox
        ),
      },
    }));
  }

  function updateWorkflow(id: string, partial: Partial<AutomationWorkflow>) {
    setData((current) => ({
      ...current,
      profile: {
        ...current.profile,
        workflows: (current.profile.workflows || []).map((workflow) =>
          workflow.id === id ? { ...workflow, ...partial } : workflow
        ),
      },
    }));
  }

  function updateTemplate(id: string, partial: Partial<AutomationTemplate>) {
    setData((current) => ({
      ...current,
      profile: {
        ...current.profile,
        templates: current.profile.templates.map((template) =>
          template.id === id ? { ...template, ...partial } : template
        ),
      },
    }));
  }

  async function saveSettings() {
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/automation/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isEnabled: profile.isEnabled,
          globalKillSwitch: profile.globalKillSwitch,
          checkIntervalSeconds: profile.checkIntervalSeconds,
          maxEmailsPerRun: profile.maxEmailsPerRun,
          matchThreshold: profile.matchThreshold,
          multipleChoiceGap: profile.multipleChoiceGap,
          maxMatches: profile.maxMatches,
          activeTopicLimit: profile.activeTopicLimit,
          topicSourceType: profile.topicSourceType,
          topicSourceUrl: profile.topicSourceUrl,
          formSheetUrl: profile.formSheetUrl,
          blockedSenders: listToText(profile.blockedSendersJson).split(/\r?\n/).filter(Boolean),
          blockedDomains: listToText(profile.blockedDomainsJson).split(/\r?\n/).filter(Boolean),
          skipPhrases: listToText(profile.skipPhrasesJson).split(/\r?\n/).filter(Boolean),
          mailboxes: profile.mailboxes.map((mailbox) => ({
            id: mailbox.id,
            label: mailbox.label,
            emailAddress: mailbox.emailAddress,
            isEnabled: mailbox.isEnabled,
            authStatus: mailbox.authStatus,
          })),
          workflows: (profile.workflows || []).map((wf) => ({
            id: wf.id,
            isEnabled: wf.isEnabled,
            mode: wf.mode,
            timezone: wf.timezone,
            scheduleHour: wf.scheduleHour,
            scheduleMinute: wf.scheduleMinute,
            queueLabelId: wf.queueLabelId,
            queueLabelName: wf.queueLabelName,
            dailyCap: wf.dailyCap,
            batchSize: wf.batchSize,
          })),
        }),
      });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || "Failed to save automation settings.");
      // Destructure only the known AutomationOverview keys so that extra response
      // fields (e.g. `success`) never leak into component state.
      setData({
        profile: next.profile,
        recentRuns: next.recentRuns,
        draftLogs: next.draftLogs,
        learnedRules: next.learnedRules,
        recentWorkflowRuns: next.recentWorkflowRuns || data.recentWorkflowRuns || [],
        recentDeliveries: next.recentDeliveries || data.recentDeliveries || [],
      });
      setBanner({ type: "success", text: "Automation settings saved." });
    } catch (error) {
      setBanner({ type: "error", text: error instanceof Error ? error.message : "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplates() {
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/automation/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templates: profile.templates.map((template) => ({
            id: template.id,
            subject: template.subject,
            body: template.body,
            isEnabled: template.isEnabled,
          })),
        }),
      });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || "Failed to save templates.");
      setData((current) => ({
        ...current,
        profile: { ...current.profile, templates: next.templates },
      }));
      setBanner({ type: "success", text: "Templates saved." });
    } catch (error) {
      setBanner({ type: "error", text: error instanceof Error ? error.message : "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  async function rotateToken(mailboxId: string) {
    setSaving(true);
    setBanner(null);
    setRevealedToken(null);
    try {
      const res = await fetch("/api/admin/automation/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate_bridge_token", mailboxId }),
      });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || "Failed to rotate bridge token.");
      // Pull bridgeToken out first, then set only the AutomationOverview keys into state.
      const { bridgeToken } = next;
      setData({
        profile: next.profile,
        recentRuns: next.recentRuns,
        draftLogs: next.draftLogs,
        learnedRules: next.learnedRules,
        recentWorkflowRuns: next.recentWorkflowRuns || data.recentWorkflowRuns || [],
        recentDeliveries: next.recentDeliveries || data.recentDeliveries || [],
      });
      setRevealedToken(bridgeToken);
      setBanner({ type: "success", text: "Bridge token created. It is shown once." });
    } catch (error) {
      setBanner({ type: "error", text: error instanceof Error ? error.message : "Failed to rotate token." });
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/automation/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testInput),
      });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || "Failed to run test.");
      setTestResult(next.result);
    } catch (error) {
      setBanner({ type: "error", text: error instanceof Error ? error.message : "Failed to run test." });
    } finally {
      setSaving(false);
    }
  }

  async function deleteLearnedRule(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/automation/learned-rules/${id}`, {
        method: "DELETE",
      });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || "Failed to delete learned rule.");
      setData((current) => ({
        ...current,
        learnedRules: current.learnedRules.filter((rule) => rule.id !== id),
      }));
      setConfirmingRuleId(null);
      setBanner({ type: "success", text: "Learned rule deleted." });
    } catch (error) {
      setBanner({ type: "error", text: error instanceof Error ? error.message : "Failed to delete rule." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Automation Center</h1>
          <p className="mt-1 text-sm text-slate-500">
            Draft-only controls for Authority Magazine email automation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill label={profile.isEnabled ? "Enabled" : "Paused"} tone={profile.isEnabled ? "emerald" : "slate"} />
          <StatusPill label={profile.globalKillSwitch ? "Kill Switch On" : "Draft Only"} tone={profile.globalKillSwitch ? "rose" : "indigo"} />
          <StatusPill label={`v${profile.configVersion}`} tone="amber" />
        </div>
      </div>

      {banner && (
        <div
          role="alert"
          className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {banner.text}
        </div>
      )}

      {revealedToken && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Bridge token</p>
          <code className="mt-2 block overflow-x-auto rounded-md bg-white px-3 py-2 text-xs text-slate-800">
            {revealedToken}
          </code>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Bridge Mailboxes" value={`${stats.connected}/${profile.mailboxes.length}`} />
        <Metric label="Recent Draft Logs" value={stats.drafts} />
        <Metric label="Recent Run Errors" value={stats.errors} />
        <Metric label="Match Threshold" value={`${profile.matchThreshold}%`} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        <div className="flex min-w-max gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "mailboxes" && (
        <section className="space-y-4">
          <ControlBar profile={profile} updateProfile={updateProfile} saveSettings={saveSettings} saving={saving} />
          <div className="grid gap-4 lg:grid-cols-2">
            {profile.mailboxes.map((mailbox) => (
              <MailboxPanel
                key={mailbox.id}
                mailbox={mailbox}
                updateMailbox={updateMailbox}
                rotateToken={rotateToken}
                saving={saving}
              />
            ))}
          </div>
        </section>
      )}

      {activeTab === "generic" && (
        <GenericWorkflowPanel
          profile={profile}
          recentWorkflowRuns={data.recentWorkflowRuns || []}
          recentDeliveries={data.recentDeliveries || []}
          updateWorkflow={updateWorkflow}
          updateTemplate={updateTemplate}
          saveSettings={saveSettings}
          saving={saving}
        />
      )}


      {activeTab === "templates" && (
        <section className="space-y-4">
          {profile.templates.map((template) => (
            <TemplateEditor key={template.id} template={template} updateTemplate={updateTemplate} />
          ))}
          <ActionFooter saving={saving} onSave={saveTemplates} label="Save Templates" />
        </section>
      )}

      {activeTab === "rules" && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Safety Rules</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <TextList
              label="Skip Phrases"
              value={listToText(profile.skipPhrasesJson)}
              onChange={(value) => updateProfile({ skipPhrasesJson: value.split(/\r?\n/).filter(Boolean) })}
            />
            <TextList
              label="Blocked Senders"
              value={listToText(profile.blockedSendersJson)}
              onChange={(value) => updateProfile({ blockedSendersJson: value.split(/\r?\n/).filter(Boolean) })}
            />
            <TextList
              label="Blocked Domains"
              value={listToText(profile.blockedDomainsJson)}
              onChange={(value) => updateProfile({ blockedDomainsJson: value.split(/\r?\n/).filter(Boolean) })}
            />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {profile.suppressions.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{entry.value}</p>
                <p className="mt-1 text-xs text-slate-500">{entry.reason || entry.kind}</p>
              </div>
            ))}
          </div>
          <ActionFooter saving={saving} onSave={saveSettings} label="Save Rules" />
        </section>
      )}

      {activeTab === "learning" && (
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Learning & Intelligence</h2>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                  {data.learnedRules.length} rules
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Corrections synced from the Python engine (learned_rules.json). Auto-applied when matching incoming pitches.
              </p>
            </div>
            <div className="w-full sm:w-64">
              <input
                type="search"
                placeholder="Search learned rules..."
                value={learningSearch}
                onChange={(e) => setLearningSearch(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {data.learnedRules.length === 0 ? (
              <EmptyState text="No learned corrections have been synced yet. The Python engine automatically uploads learned rules on startup and scan cycles." />
            ) : filteredRules.length === 0 ? (
              <EmptyState text={`No rules match "${learningSearch}".`} />
            ) : (
              filteredRules.map((rule) => (
                <div key={rule.id} className="flex flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{rule.originalTopic}</p>
                      {rule.confidence != null && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                          {Math.round(rule.confidence * 100)}% conf
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-emerald-700">
                      <span className="font-medium text-slate-400">&rarr;</span>
                      <span className="font-medium">{rule.correctTopicName}</span>
                    </div>
                  </div>
                  {confirmingRuleId === rule.id ? (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmingRuleId(null)}
                        disabled={saving}
                        className="self-start rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteLearnedRule(rule.id)}
                        disabled={saving}
                        className="self-start rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Confirm delete
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingRuleId(rule.id)}
                      disabled={saving}
                      className="self-start rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 shrink-0"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {activeTab === "activity" && (
        <ActivityPanel runs={data.recentRuns} draftLogs={data.draftLogs} />
      )}

      {activeTab === "test" && (
        <TestLab
          input={testInput}
          setInput={setTestInput}
          result={testResult}
          runTest={runTest}
          saving={saving}
        />
      )}
    </div>
  );
}

function GenericWorkflowPanel({
  profile,
  recentWorkflowRuns,
  recentDeliveries,
  updateWorkflow,
  updateTemplate,
  saveSettings,
  saving,
}: {
  profile: AutomationProfile;
  recentWorkflowRuns: AutomationWorkflowRun[];
  recentDeliveries: AutomationDelivery[];
  updateWorkflow: (id: string, partial: Partial<AutomationWorkflow>) => void;
  updateTemplate: (id: string, partial: Partial<AutomationTemplate>) => void;
  saveSettings: () => void;
  saving: boolean;
}) {
  const [previewMode, setPreviewMode] = useState<"html" | "raw">("html");
  const [editingTemplate, setEditingTemplate] = useState(false);

  const workflow =
    (profile.workflows || []).find((w) => w.key === "GENERIC_RESPONSE") ||
    profile.workflows?.[0];

  const mailbox =
    profile.mailboxes.find(
      (m) => m.id === workflow?.mailboxId || m.emailAddress === "editor@authoritymag.co"
    ) || profile.mailboxes[0];

  const template = profile.templates.find(
    (t) => t.templateKey === (workflow?.templateKey || "generic_response")
  );

  if (!workflow) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">No Generic Response Workflow Configured</h2>
        <p className="mt-2 text-sm text-slate-500">
          The daily generic response workflow has not been initialized for this profile.
        </p>
      </section>
    );
  }

  const sentCount = recentDeliveries.filter((d) => d.state === "SENT" || d.state === "CLEANED").length;
  const heldCount = recentDeliveries.filter((d) => d.state === "HELD" || d.state === "SUPPRESSED").length;
  const errorCount = recentDeliveries.filter((d) => d.state === "UNKNOWN" || d.state === "RETRYABLE").length;

  return (
    <section className="space-y-6">
      {/* Status / Mode Banner */}
      {workflow.isEnabled && workflow.mode === "SEND" ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="flex items-center gap-2 font-bold text-rose-800">
            <span className="text-base">&#9888;&#65039;</span> LIVE SENDING ACTIVE (10:00 AM NY)
          </div>
          <p className="mt-1">
            At 10:00 AM America/New_York daily, matching emails in the verified queue label (&ldquo;{workflow.queueLabelName || "1. Send Generic Re..."}&rdquo;) will receive live outgoing emails, and the queue label will be removed upon confirmed send.
          </p>
        </div>
      ) : workflow.isEnabled && workflow.mode === "PREVIEW" ? (
        <div className="rounded-lg border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
          <div className="flex items-center gap-2 font-bold text-sky-800">
            <span className="text-base">&#128269;</span> PREVIEW MODE (Safe Dry Run)
          </div>
          <p className="mt-1">
            The daemon will discover queue candidates, inspect thread history, check suppressions, and log planned decisions. No emails will be sent and no Gmail labels will be modified.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <span className="text-base">&#9208;&#65039;</span> Daily Generic Workflow Paused
          </div>
          <p className="mt-1">
            Scheduled execution is currently inactive. Toggle &ldquo;Enable Daily Workflow&rdquo; below to activate daily 10:00 AM NY runs.
          </p>
        </div>
      )}

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Execution Mode" value={workflow.mode} />
        <Metric label="Queue Deliveries" value={recentDeliveries.length} />
        <Metric label="Confirmed Sent" value={sentCount} />
        <Metric label="Held / Suppressed" value={heldCount + errorCount} />
      </div>

      {/* Workflow Controls Card */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{workflow.name}</h2>
            <p className="text-xs text-slate-500">
              {workflow.description || "Daily scheduled generic response engine for editor inbox."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill label={workflow.isEnabled ? "Active" : "Disabled"} tone={workflow.isEnabled ? "emerald" : "slate"} />
            <StatusPill label={workflow.mode} tone={workflow.mode === "SEND" ? "rose" : "indigo"} />
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Toggle
            label="Enable Daily Workflow"
            checked={workflow.isEnabled}
            onChange={(checked) => updateWorkflow(workflow.id, { isEnabled: checked })}
          />
          <SelectField
            label="Execution Mode"
            value={workflow.mode}
            options={["PREVIEW", "SEND"]}
            onChange={(value) => updateWorkflow(workflow.id, { mode: value })}
          />
          <TextField
            label="Verified Queue Label Name"
            value={workflow.queueLabelName || ""}
            onChange={(value) => updateWorkflow(workflow.id, { queueLabelName: value })}
          />
          <NumberField
            label="Daily Cap"
            value={workflow.dailyCap}
            onChange={(value) => updateWorkflow(workflow.id, { dailyCap: value })}
            suffix="max"
          />
          <NumberField
            label="Batch Size"
            value={workflow.batchSize}
            onChange={(value) => updateWorkflow(workflow.id, { batchSize: value })}
            suffix="per batch"
          />
          <div className="rounded-lg border border-slate-200 px-3 py-2 bg-slate-50">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Schedule &amp; Zone</span>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {String(workflow.scheduleHour).padStart(2, "0")}:{String(workflow.scheduleMinute).padStart(2, "0")} {workflow.timezone} (DST)
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Target Mailbox</p>
            <p className="text-sm font-semibold text-slate-800">{mailbox?.emailAddress || "editor@authoritymag.co"}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill label={mailbox?.bridgeStatus || "UNKNOWN"} tone={mailbox?.bridgeStatus === "CONNECTED" ? "emerald" : "amber"} />
            <span className="text-xs text-slate-500">Last run: {formatDate(mailbox?.lastRunAt)}</span>
          </div>
        </div>

        <ActionFooter saving={saving} onSave={saveSettings} label="Save Workflow Settings" />
      </div>

      {/* Template Preview Card */}
      {template && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{template.name}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  key: {template.templateKey} · v{template.version}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Subject: <span className="font-mono text-slate-700">{template.subject || "Re: {{original_subject}}"}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border border-slate-200 p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewMode("html")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded ${
                    previewMode === "html" ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  HTML Preview
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("raw")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded ${
                    previewMode === "raw" ? "bg-indigo-600 text-white" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Raw Copy
                </button>
              </div>
              <button
                type="button"
                onClick={() => setEditingTemplate(!editingTemplate)}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {editingTemplate ? "Close Editor" : "Edit Copy"}
              </button>
            </div>
          </div>

          {editingTemplate ? (
            <div className="mt-4 space-y-4">
              <TextField
                label="Subject"
                value={template.subject || ""}
                onChange={(value) => updateTemplate(template.id, { subject: value })}
              />
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Body</span>
                <textarea
                  value={template.body}
                  onChange={(event) => updateTemplate(template.id, { body: event.target.value })}
                  rows={12}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono leading-6 text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </label>
              <ActionFooter saving={saving} onSave={saveSettings} label="Save Template Changes" />
            </div>
          ) : previewMode === "html" ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-5 font-sans text-sm leading-relaxed text-slate-800 space-y-4">
                <p>Hi There!</p>
                <p>
                  Thank you so much for sending your press release or pitch to Authority Magazine. We appreciate your interest and would be happy to conduct an email interview with you.
                </p>
                <p>To get started, please review our available interview storylines below:</p>
                <div className="my-2">
                  <a
                    href="https://medium.com/authority-magazine/ongoing-interview-series-in-authority-magazine-7d633a349753"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
                  >
                    Interview Storylines &rarr;
                  </a>
                </div>
                <p>We&apos;re also excited to announce these upcoming storylines:</p>
                <div className="my-2">
                  <a
                    href="https://medium.com/authority-magazine/new-interview-series-topics-we-are-working-on-bdae530b5bf4"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
                  >
                    Upcoming Storylines &rarr;
                  </a>
                </div>
                <p>
                  If you are unsure about which topic is best for you, you can ask our AI Bot to recommend a few ideas for you. All you have to do is add your bio to the link below:
                </p>
                <div className="my-2">
                  <a
                    href="https://chatgpt.com/g/g-DOnEg59Sc-authority-magazine-bot"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                  >
                    Add Your Bio Here (AI Bot) &rarr;
                  </a>
                </div>
                <p>
                  Please take a moment to choose the best fit for your interview. Once you&apos;ve made your selection, click the link below to provide your basic information, and we&apos;ll be in touch shortly with our interview questions:
                </p>
                <div className="my-2">
                  <a
                    href="https://docs.google.com/forms/d/e/1FAIpQLSdkUiiJpgE53-I6pDQOm-zWveNeCXkGFonoVX5ULmN0dPsfxA/viewform"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
                  >
                    Add Your Basic Info Here (Form) &rarr;
                  </a>
                </div>
                <p>Looking forward to learning more about you and your story!</p>
                <p className="pt-2 leading-relaxed">
                  Best regards,<br /><br />
                  <span className="font-semibold">&nbsp;&nbsp;&nbsp;&nbsp;Yitzi Weiner</span><br />
                  <span className="text-slate-600">&nbsp;&nbsp;&nbsp;&nbsp;Editor-In-Chief,</span><br />
                  <span className="text-slate-600">&nbsp;&nbsp;&nbsp;&nbsp;Authority Magazine</span>
                </p>
              </div>

              {/* Verified Links Inspector */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Verified Hyperlinks in Response</h4>
                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  <a
                    href="https://medium.com/authority-magazine/ongoing-interview-series-in-authority-magazine-7d633a349753"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-indigo-600 hover:underline p-2 rounded bg-slate-50 border border-slate-100"
                  >
                    <span>&#128279;</span> Interview Storylines (Medium)
                  </a>
                  <a
                    href="https://medium.com/authority-magazine/new-interview-series-topics-we-are-working-on-bdae530b5bf4"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-indigo-600 hover:underline p-2 rounded bg-slate-50 border border-slate-100"
                  >
                    <span>&#128279;</span> Upcoming Storylines (Medium)
                  </a>
                  <a
                    href="https://chatgpt.com/g/g-DOnEg59Sc-authority-magazine-bot"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-emerald-600 hover:underline p-2 rounded bg-slate-50 border border-slate-100"
                  >
                    <span>&#128279;</span> AI Recommendation Bot (ChatGPT)
                  </a>
                  <a
                    href="https://docs.google.com/forms/d/e/1FAIpQLSdkUiiJpgE53-I6pDQOm-zWveNeCXkGFonoVX5ULmN0dPsfxA/viewform"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-indigo-600 hover:underline p-2 rounded bg-slate-50 border border-slate-100"
                  >
                    <span>&#128279;</span> Submission Form (Google Forms)
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs font-mono leading-5 text-slate-50 whitespace-pre-wrap">
                {template.body}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* History & Deliveries */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Runs */}
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Daily Runs</h3>
            <span className="text-xs text-slate-500">{recentWorkflowRuns.length} recorded</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {recentWorkflowRuns.length === 0 ? (
              <EmptyState text="No workflow runs recorded yet. Scheduled runs trigger at 10:00 AM NY." />
            ) : (
              recentWorkflowRuns.map((run) => (
                <div key={run.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{run.localDate}</span>
                    <StatusPill
                      label={run.status}
                      tone={
                        run.status === "SUCCESS"
                          ? "emerald"
                          : run.status === "FAILED"
                          ? "rose"
                          : run.status === "PROCESSING"
                          ? "indigo"
                          : "amber"
                      }
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {run.emailsScanned} scanned · {run.sentCount} sent · {run.heldCount} held · {run.skippedCount} skipped · {run.errorCount} errors
                  </p>
                  {run.summary && <p className="text-xs text-slate-600 italic">{run.summary}</p>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Deliveries */}
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Queue Deliveries</h3>
            <span className="text-xs text-slate-500">{recentDeliveries.length} tracked</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
            {recentDeliveries.length === 0 ? (
              <EmptyState text="No delivery attempts recorded yet." />
            ) : (
              recentDeliveries.map((delivery) => (
                <div key={delivery.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 truncate max-w-[220px]">
                      {delivery.recipient}
                    </span>
                    <StatusPill
                      label={delivery.state}
                      tone={
                        delivery.state === "CLEANED" || delivery.state === "SENT"
                          ? "emerald"
                          : delivery.state === "UNKNOWN" || delivery.state === "RETRYABLE"
                          ? "rose"
                          : delivery.state === "PREPARED" || delivery.state === "SENDING"
                          ? "indigo"
                          : "amber"
                      }
                    />
                  </div>
                  <p className="text-xs text-slate-600 truncate">{delivery.subject || "No Subject"}</p>
                  <p className="text-[11px] text-slate-400">
                    Thread: {delivery.gmailThreadId} · {formatDate(delivery.createdAt)}
                    {delivery.errorMessage && (
                      <span className="block text-rose-600 mt-0.5">{delivery.errorMessage}</span>
                    )}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ControlBar({
  profile,
  updateProfile,
  saveSettings,
  saving,
}: {
  profile: AutomationProfile;
  updateProfile: (partial: Partial<AutomationProfile>) => void;
  saveSettings: () => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Toggle label="Automation Enabled" checked={profile.isEnabled} onChange={(checked) => updateProfile({ isEnabled: checked })} />
        <Toggle label="Kill Switch" checked={profile.globalKillSwitch} onChange={(checked) => updateProfile({ globalKillSwitch: checked })} danger />
        <NumberField label="Check Interval" value={profile.checkIntervalSeconds} onChange={(value) => updateProfile({ checkIntervalSeconds: value })} suffix="sec" />
        <NumberField label="Max Emails" value={profile.maxEmailsPerRun} onChange={(value) => updateProfile({ maxEmailsPerRun: value })} />
        <NumberField label="Match Threshold" value={profile.matchThreshold} onChange={(value) => updateProfile({ matchThreshold: value })} suffix="%" />
      </div>
      <ActionFooter saving={saving} onSave={saveSettings} label="Save Mailbox Settings" />
    </div>
  );
}

function MailboxPanel({
  mailbox,
  updateMailbox,
  rotateToken,
  saving,
}: {
  mailbox: AutomationMailbox;
  updateMailbox: (id: string, partial: Partial<AutomationMailbox>) => void;
  rotateToken: (id: string) => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{mailbox.label}</h2>
          <p className="mt-1 text-sm text-slate-500">{mailbox.emailAddress}</p>
        </div>
        <StatusPill label={mailbox.bridgeStatus.replace(/_/g, " ")} tone={mailbox.bridgeStatus === "CONNECTED" ? "emerald" : "amber"} />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <TextField label="Label" value={mailbox.label} onChange={(value) => updateMailbox(mailbox.id, { label: value })} />
        <TextField label="Email Address" value={mailbox.emailAddress} onChange={(value) => updateMailbox(mailbox.id, { emailAddress: value })} />
        <Toggle label="Mailbox Enabled" checked={mailbox.isEnabled} onChange={(checked) => updateMailbox(mailbox.id, { isEnabled: checked })} />
        <SelectField
          label="Auth Status"
          value={mailbox.authStatus}
          onChange={(value) => updateMailbox(mailbox.id, { authStatus: value })}
          options={["UNKNOWN", "OK", "ACTION_REQUIRED", "ERROR"]}
        />
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bridge</p>
        <p className="mt-2 text-sm text-slate-700">
          Token: {mailbox.bridgeTokenPreview || "Not created"} · Last heartbeat: {formatDate(mailbox.lastHeartbeatAt)}
        </p>
        {mailbox.lastError && <p className="mt-2 text-sm text-rose-700">{mailbox.lastError}</p>}
        <button
          type="button"
          onClick={() => rotateToken(mailbox.id)}
          disabled={saving}
          className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Rotate Token
        </button>
      </div>
    </div>
  );
}

function TemplateEditor({
  template,
  updateTemplate,
}: {
  template: AutomationTemplate;
  updateTemplate: (id: string, partial: Partial<AutomationTemplate>) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{template.name}</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {template.templateKey} · v{template.version} · {listToText(template.allowedVariablesJson).replace(/\n/g, ", ")}
          </p>
        </div>
        <Toggle label="Enabled" checked={template.isEnabled} onChange={(checked) => updateTemplate(template.id, { isEnabled: checked })} />
      </div>
      <div className="mt-4 space-y-4">
        <TextField label="Subject" value={template.subject || ""} onChange={(value) => updateTemplate(template.id, { subject: value })} />
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Body</span>
          <textarea
            value={template.body}
            onChange={(event) => updateTemplate(template.id, { body: event.target.value })}
            rows={10}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono leading-6 text-slate-900 focus:border-indigo-500 focus:outline-none"
          />
        </label>
      </div>
    </section>
  );
}

function ActivityPanel({ runs, draftLogs }: { runs: AutomationRun[]; draftLogs: AutomationDraftLog[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Runs</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {runs.length === 0 ? (
            <EmptyState text="No bridge runs have been logged yet." />
          ) : (
            runs.map((run) => (
              <div key={run.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{run.mailbox?.label || "Automation run"}</p>
                  <StatusPill label={run.status} tone={run.errorCount > 0 ? "rose" : "emerald"} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {run.emailsScanned} scanned · {run.draftsCreated} drafts · {run.skippedCount} skipped · {formatDate(run.startedAt)}
                </p>
                {run.summary && <p className="mt-2 text-sm text-slate-700">{run.summary}</p>}
              </div>
            ))
          )}
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Draft Logs</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {draftLogs.length === 0 ? (
            <EmptyState text="No drafts or skips have been logged yet." />
          ) : (
            draftLogs.map((log) => (
              <div key={log.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-900">{log.subject || log.recipient || log.workflowType}</p>
                  <StatusPill label={log.status.replace(/_/g, " ")} tone={log.status === "DRAFT_CREATED" ? "emerald" : "amber"} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {log.recipient || "No recipient"} · {log.matchedTopic || "No match"} · {formatDate(log.createdAt)}
                </p>
                {log.reason && <p className="mt-2 text-sm text-slate-700">{log.reason}</p>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function TestLab({
  input,
  setInput,
  result,
  runTest,
  saving,
}: {
  input: { subject: string; sender: string; body: string };
  setInput: (input: { subject: string; sender: string; body: string }) => void;
  result: Record<string, unknown> | null;
  runTest: () => void;
  saving: boolean;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Test Lab</h2>
        <div className="mt-4 space-y-4">
          <TextField label="Subject" value={input.subject} onChange={(value) => setInput({ ...input, subject: value })} />
          <TextField label="Sender" value={input.sender} onChange={(value) => setInput({ ...input, sender: value })} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Email Body</span>
            <textarea
              value={input.body}
              onChange={(event) => setInput({ ...input, body: event.target.value })}
              rows={12}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={runTest}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Run Test
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Result</h2>
        {result ? (
          <pre className="mt-4 max-h-[560px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-50">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <EmptyState text="Run a test to preview workflow, score, reasons, and draft copy." />
        )}
      </div>
    </section>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="mt-1 flex rounded-lg border border-slate-200 focus-within:border-indigo-500">
        <input
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full rounded-l-lg px-3 py-2 text-sm text-slate-900 focus:outline-none"
        />
        {suffix && <span className="border-l border-slate-200 px-3 py-2 text-sm text-slate-500">{suffix}</span>}
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextList({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-900 focus:border-indigo-500 focus:outline-none"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  danger = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  danger?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className={`h-4 w-4 rounded border-slate-300 ${danger ? "accent-rose-600" : "accent-indigo-600"}`}
      />
    </label>
  );
}

function ActionFooter({ saving, onSave, label }: { saving: boolean; onSave: () => void; label: string }) {
  return (
    <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : label}
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "emerald" | "rose" | "indigo" | "amber" | "slate" }) {
  const colors = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${colors[tone]}`}>
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-sm text-slate-500">{text}</p>;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function listToText(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join("\n");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).join("\n");
    } catch {
      return value;
    }
  }
  return "";
}
