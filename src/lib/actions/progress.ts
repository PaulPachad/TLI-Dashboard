import type {
  InterviewActionType,
  InterviewView,
} from "@/types/interview";

interface ProgressAction {
  actionType: string;
  status: string;
}

interface ProgressInterview {
  intervieweeEmail?: string | null;
  publicistEmail?: string | null;
  actions?: ProgressAction[];
}

export interface InterviewProgress {
  currentStatus: InterviewView["currentStatus"];
  nextAction: InterviewActionType | "leveraged";
  nextActionLabel: string;
  actionSummary: InterviewView["actionSummary"];
}

export function getInterviewProgress(
  interview: ProgressInterview
): InterviewProgress {
  const actions = interview.actions ?? [];
  const hasAction = (type: string) =>
    actions.some(
      (action) => action.actionType === type && action.status === "SUCCESS"
    );

  const liveEmailSent = hasAction("LIVE_EMAIL_SENT");
  const linkedinGenerated = hasAction("LINKEDIN_POST_GENERATED");
  const markedShared = hasAction("MARKED_SHARED");
  const zoomInviteSent = hasAction("ZOOM_INVITE_SENT");
  const hasEmail = Boolean(
    interview.intervieweeEmail || interview.publicistEmail
  );

  let currentStatus: InterviewView["currentStatus"] = "new";
  if (!hasEmail) currentStatus = "needs_contact";
  else if (zoomInviteSent && markedShared && liveEmailSent)
    currentStatus = "leveraged";
  else if (markedShared) currentStatus = "shared";
  else if (liveEmailSent) currentStatus = "email_sent";

  let nextAction: InterviewActionType | "leveraged" = "send_live_email";
  let nextActionLabel = "Send Live Link Email";

  if (!hasEmail) {
    nextAction = "add_contact";
    nextActionLabel = "Add contact info";
  } else if (!liveEmailSent) {
    nextAction = "send_live_email";
    nextActionLabel = "Send Live Link Email";
  } else if (!linkedinGenerated) {
    nextAction = "generate_linkedin";
    nextActionLabel = "Generate LinkedIn Post";
  } else if (!markedShared) {
    nextAction = "mark_shared";
    nextActionLabel = "Mark as Shared";
  } else if (!zoomInviteSent) {
    nextAction = "send_zoom_invite";
    nextActionLabel = "Invite to Zoom Follow-Up";
  } else {
    nextAction = "leveraged";
    nextActionLabel = "Fully Leveraged";
  }

  return {
    currentStatus,
    nextAction,
    nextActionLabel,
    actionSummary: {
      liveEmailSent,
      linkedinGenerated,
      markedShared,
      zoomInviteSent,
    },
  };
}
