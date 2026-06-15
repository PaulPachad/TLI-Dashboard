export type InterviewActionType =
  | "add_contact"
  | "send_live_email"
  | "generate_linkedin"
  | "generate_social_image"
  | "mark_shared"
  | "send_zoom_invite";

export interface InterviewActionRecord {
  id: string;
  actionType: string;
  status: string;
  createdAt: string;
  recipient?: string | null;
  note?: string | null;
  linkedinPostUrl?: string | null;
  metadataJson?: unknown;
}

export interface InterviewView {
  id: string;
  intervieweeName: string;
  intervieweeCompany?: string | null;
  intervieweeEmail?: string | null;
  intervieweeTitle?: string | null;
  publicistName?: string | null;
  publicistEmail?: string | null;
  topic?: string | null;
  articleUrl: string;
  buzzfeedUrl?: string | null;
  interviewDocUrl?: string | null;
  image1Url?: string | null;
  image2Url?: string | null;
  videoUrl?: string | null;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  estimatedPublishDate?: string | null;
  liveEmailStatusImported?: string | null;
  currentStatus:
    | "new"
    | "needs_contact"
    | "email_sent"
    | "shared"
    | "leveraged";
  nextAction: InterviewActionType | "leveraged";
  nextActionLabel: string;
  actions: InterviewActionRecord[];
  actionSummary: {
    liveEmailSent: boolean;
    linkedinGenerated: boolean;
    socialImageGenerated: boolean;
    markedShared: boolean;
    zoomInviteSent: boolean;
  };
}
