import { EmailShell } from "./email-shell";

export function OutreachEmail({
  body,
  heading,
}: {
  body: string;
  heading: string;
}) {
  return (
    <EmailShell
      eyebrow="Authority Magazine"
      heading={heading}
      body={body}
      accent="#800000"
    />
  );
}
