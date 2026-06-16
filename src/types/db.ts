// ==============================================================================
// Database Enums defined at the code level (for SQLite support)
// ==============================================================================

export enum UserRole {
  ADMIN = "ADMIN",
  CLIENT = "CLIENT",
}

export enum ActionType {
  LIVE_EMAIL_GENERATED = "LIVE_EMAIL_GENERATED",
  LIVE_EMAIL_SENT = "LIVE_EMAIL_SENT",
  LINKEDIN_POST_GENERATED = "LINKEDIN_POST_GENERATED",
  LINKEDIN_POST_COPIED = "LINKEDIN_POST_COPIED",
  MARKED_SHARED = "MARKED_SHARED",
  LINKEDIN_URL_ADDED = "LINKEDIN_URL_ADDED",
  ZOOM_INVITE_SENT = "ZOOM_INVITE_SENT",
  NOTE_ADDED = "NOTE_ADDED",
  CONTACT_INFO_UPDATED = "CONTACT_INFO_UPDATED",
  IMPORT_CREATED = "IMPORT_CREATED",
  PROMINENCE_RESEARCHED = "PROMINENCE_RESEARCHED",
}

export enum ActionStatus {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  PENDING = "PENDING",
}
