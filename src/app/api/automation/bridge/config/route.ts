import { NextResponse } from "next/server";
import { getMailboxForBridgeToken, toJsonList } from "@/lib/automation/service";

export async function GET(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Bridge token required." }, { status: 401 });
    }

    const mailbox = await getMailboxForBridgeToken(token);
    if (!mailbox) {
      return NextResponse.json({ error: "Invalid bridge token." }, { status: 401 });
    }

    const profile = mailbox.profile;
    const templates = profile.templates.map((template) => ({
      key: template.templateKey,
      name: template.name,
      subject: template.subject,
      body: template.body,
      allowedVariables: toJsonList(template.allowedVariablesJson),
      enabled: template.isEnabled,
      version: template.version,
    }));

    return NextResponse.json({
      profile: {
        id: profile.id,
        name: profile.name,
        enabled: profile.isEnabled && !profile.globalKillSwitch,
        globalKillSwitch: profile.globalKillSwitch,
        mode: "DRAFT_ONLY",
        configVersion: profile.configVersion,
        checkIntervalSeconds: profile.checkIntervalSeconds,
        maxEmailsPerRun: profile.maxEmailsPerRun,
        matchThreshold: profile.matchThreshold,
        multipleChoiceGap: profile.multipleChoiceGap,
        maxMatches: profile.maxMatches,
        activeTopicLimit: profile.activeTopicLimit,
        topicSourceType: profile.topicSourceType,
        topicSourceUrl: profile.topicSourceUrl,
        formSheetUrl: profile.formSheetUrl,
        blockedSenders: toJsonList(profile.blockedSendersJson),
        blockedDomains: toJsonList(profile.blockedDomainsJson),
        skipPhrases: toJsonList(profile.skipPhrasesJson),
      },
      mailbox: {
        id: mailbox.id,
        label: mailbox.label,
        emailAddress: mailbox.emailAddress,
        workflowType: mailbox.workflowType,
        enabled: mailbox.isEnabled && profile.isEnabled && !profile.globalKillSwitch,
      },
      templates,
      suppressions: profile.suppressions.map((entry) => ({
        kind: entry.kind,
        value: entry.value,
        reason: entry.reason,
        enabled: entry.isEnabled,
      })),
    });
  } catch (error) {
    console.error("Bridge config failed.", error);
    return NextResponse.json({ error: "Failed to load bridge config." }, { status: 500 });
  }
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
