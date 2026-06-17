import { EmailShell } from "./email-shell";

export function LiveLinkEmail({ body }: { body: string }) {
  return (
    <EmailShell
      eyebrow="Authority Magazine"
      heading="Your interview is live"
      body={body}
      accent="#800000"
    />
  );
}
