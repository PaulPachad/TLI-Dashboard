import { EmailShell } from "./email-shell";

export function ZoomInviteEmail({ body }: { body: string }) {
  return (
    <EmailShell
      eyebrow="TLI Follow-Up"
      heading="Continue the conversation"
      body={body}
      accent="#0f766e"
    />
  );
}
