export function formatActionLabel(type: string, status?: string | null): string {
  if (status === "FAILED") {
    const failedLabels: Record<string, string> = {
      LIVE_EMAIL_SENT: "Live email failed",
      ZOOM_INVITE_SENT: "Zoom invitation failed",
      LINKEDIN_POST_GENERATED: "LinkedIn post generation failed",
      SOCIAL_IMAGE_GENERATED: "Social image generation failed",
      PROMINENCE_RESEARCHED: "Standout research failed",
    };
    if (failedLabels[type]) return failedLabels[type];
  }

  const labels: Record<string, string> = {
    LIVE_EMAIL_GENERATED: "Live email generated",
    LIVE_EMAIL_SENT: "Live email sent",
    LINKEDIN_POST_GENERATED: "LinkedIn post generated",
    LINKEDIN_POST_COPIED: "LinkedIn post copied",
    MARKED_SHARED: "Marked as shared",
    LINKEDIN_URL_ADDED: "LinkedIn post URL added",
    ZOOM_INVITE_SENT: "Zoom invitation sent",
    NOTE_ADDED: "Note added",
    CONTACT_INFO_UPDATED: "Contact info updated",
    IMPORT_CREATED: "Interview imported",
    PROMINENCE_RESEARCHED: "Standout signals researched",
  };
  return labels[type] || type;
}
