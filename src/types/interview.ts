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

export interface InterviewProminenceSignal {
  label: string;
  tone: "amber" | "emerald" | "sky" | "violet" | "slate";
  value?: string | null;
  detail?: string | null;
}

export interface InterviewProminenceView {
  score: number;
  tier: "elite" | "high_value" | "notable" | "standard";
  tierLabel: string;
  confidence: "high" | "medium" | "low";
  badges: Array<{
    label: string;
    tone: "amber" | "emerald" | "sky" | "violet" | "slate";
  }>;
  reasons: string[];
  frontFlag: null | {
    label: string;
    tone: "amber" | "violet";
    reason: string;
  };
  signalGroups: {
    exceptional: InterviewProminenceSignal[];
    audience: InterviewProminenceSignal[];
    company: InterviewProminenceSignal[];
    context: InterviewProminenceSignal[];
  };
  hasAnySignals: boolean;
}

export interface InterviewView {
  id: string;
  intervieweeName: string;
  intervieweeCompany?: string | null;
  intervieweeEmail?: string | null;
  intervieweeTitle?: string | null;
  companyEmployeeCount?: number | null;
  companyRevenueUsd?: number | null;
  largestSocialFollowerCount?: number | null;
  prominenceNotes?: string | null;
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
  prominence?: InterviewProminenceView;
}
