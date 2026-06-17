"use client";

import { useMemo, useState } from "react";

type TabId =
  | "mailboxes"
  | "pitch"
  | "collab"
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
  { id: "mailboxes", label: "Mailboxes" },
  { id: "pitch", label: "Pitch Responder" },
  { id: "collab", label: "Collaboration" },
  { id: "templates", label: "Templates" },
  { id: "rules", label: "Rules" },
  { id: "learning", label: "Learning" },
  { id: "activity", label: "Activity" },
  { id: "test", label: "Test Lab" },
];

export function AutomationCenter({ initialData }: AutomationCenterProps) {
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<TabId>("mailboxes");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [testInput, setTestInput] = useState({
    subject: "Pitch: 5 Things You Need To Know To Successfully Run A Live Virtual Event",
    sender: "Publicist <publicist@example.com>",
    body:
      "Dear Authority Magazine Editors\n\nWhat is the name of the interview topic: 5 Things You Need To Know To Successfully Run A Live Virtual Event\nWhat is the best email to follow up with you: publicist@example.com",
  });
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  const profile = data.profile;
  const pitchMailbox = profile.mailboxes.find((mailbox) => mailbox.workflowType === "PITCH_RESPONDER");
  const collabMailbox = profile.mailboxes.find((mailbox) => mailbox.workflowType === "COLLAB_RESPONDER");

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
        }),
      });
      const next = await res.json();
      if (!res.ok) throw new Error(next.error || "Failed to save automation settings.");
      setData(next);
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
      setData(next);
      setRevealedToken(next.bridgeToken);
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

      {activeTab === "pitch" && pitchMailbox && (
        <ResponderPanel
          title="Pitch Responder"
          mailbox={pitchMailbox}
          profile={profile}
          updateMailbox={updateMailbox}
          updateProfile={updateProfile}
          saveSettings={saveSettings}
          saving={saving}
        />
      )}

      {activeTab === "collab" && collabMailbox && (
        <ResponderPanel
          title="Collaboration Responder"
          mailbox={collabMailbox}
          profile={profile}
          updateMailbox={updateMailbox}
          updateProfile={updateProfile}
          saveSettings={saveSettings}
          saving={saving}
          showFormSheet
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
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Learning and Corrections</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {data.learnedRules.length === 0 ? (
              <EmptyState text="No learned corrections have been synced yet." />
            ) : (
              data.learnedRules.map((rule) => (
                <div key={rule.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{rule.originalTopic}</p>
                    <p className="mt-1 text-sm text-slate-600">{rule.correctTopicName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteLearnedRule(rule.id)}
                    disabled={saving}
                    className="self-start rounded-md border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Toggle label="Automation Enabled" checked={profile.isEnabled} onChange={(checked) => updateProfile({ isEnabled: checked })} />
        <Toggle label="Kill Switch" checked={profile.globalKillSwitch} onChange={(checked) => updateProfile({ globalKillSwitch: checked })} danger />
        <NumberField label="Check Interval" value={profile.checkIntervalSeconds} onChange={(value) => updateProfile({ checkIntervalSeconds: value })} suffix="sec" />
        <NumberField label="Max Emails" value={profile.maxEmailsPerRun} onChange={(value) => updateProfile({ maxEmailsPerRun: value })} />
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

function ResponderPanel({
  title,
  mailbox,
  profile,
  updateMailbox,
  updateProfile,
  saveSettings,
  saving,
  showFormSheet = false,
}: {
  title: string;
  mailbox: AutomationMailbox;
  profile: AutomationProfile;
  updateMailbox: (id: string, partial: Partial<AutomationMailbox>) => void;
  updateProfile: (partial: Partial<AutomationProfile>) => void;
  saveSettings: () => void;
  saving: boolean;
  showFormSheet?: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{mailbox.emailAddress}</p>
        </div>
        <Toggle label="Enabled" checked={mailbox.isEnabled} onChange={(checked) => updateMailbox(mailbox.id, { isEnabled: checked })} />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <NumberField label="Match Threshold" value={profile.matchThreshold} onChange={(value) => updateProfile({ matchThreshold: value })} suffix="%" />
        <NumberField label="Multiple Gap" value={profile.multipleChoiceGap} onChange={(value) => updateProfile({ multipleChoiceGap: value })} />
        <NumberField label="Max Matches" value={profile.maxMatches} onChange={(value) => updateProfile({ maxMatches: value })} />
        <NumberField label="Active Topic Limit" value={profile.activeTopicLimit || 0} onChange={(value) => updateProfile({ activeTopicLimit: value || null })} />
      </div>
      {showFormSheet ? (
        <div className="mt-4">
          <TextField label="Form Sheet URL" value={profile.formSheetUrl || ""} onChange={(value) => updateProfile({ formSheetUrl: value })} />
        </div>
      ) : (
        <div className="mt-4">
          <TextField label="Topic Source URL" value={profile.topicSourceUrl || ""} onChange={(value) => updateProfile({ topicSourceUrl: value })} />
        </div>
      )}
      <ActionFooter saving={saving} onSave={saveSettings} label="Save Responder Settings" />
    </section>
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
