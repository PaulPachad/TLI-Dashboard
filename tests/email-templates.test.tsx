import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveLinkEmail } from "../src/lib/email/templates/live-link";
import { ZoomInviteEmail } from "../src/lib/email/templates/zoom-invite";
import {
  buildLiveLinkEmailBody,
  buildZoomInviteEmailBody,
} from "../src/lib/email/copy";
import { buildInterviewEmailRecipients } from "../src/lib/email/recipients";

test("live-link email renders branded content and a clickable article URL", () => {
  const markup = renderToStaticMarkup(
    <LiveLinkEmail
      body={
        "Hi Alex,\n\nYour interview is live:\nhttps://authoritymagazine.com/example\n\nWarmly,\nTaylor"
      }
    />
  );

  assert.match(markup, /Your interview is live/);
  assert.match(markup, /Authority Magazine/);
  assert.match(
    markup,
    /href="https:\/\/authoritymagazine\.com\/example"/
  );
});

test("Zoom invitation renders the edited message and scheduling link", () => {
  const markup = renderToStaticMarkup(
    <ZoomInviteEmail
      body={
        "Hi Alex,\n\nChoose a convenient time:\nhttps://calendly.com/example/follow-up"
      }
    />
  );

  assert.match(markup, /Continue the conversation/);
  assert.match(markup, /Choose a convenient time/);
  assert.match(markup, /https:\/\/calendly\.com\/example\/follow-up/);
});

test("live-link copy includes the sender, article, and configured LinkedIn profile", () => {
  const body = buildLiveLinkEmailBody(
    {
      intervieweeName: "Alex Morgan",
      articleUrl: "https://authoritymagazine.com/alex",
    },
    {
      name: "Taylor Reed",
      linkedinUrl: "https://linkedin.com/in/taylor",
      defaultSignoff: "Warmly",
    }
  );

  assert.match(body, /This is Taylor Reed/);
  assert.match(body, /Thank you so much for your interview/);
  assert.match(body, /https:\/\/authoritymagazine\.com\/alex/);
  assert.match(body, /LinkedIn: https:\/\/linkedin\.com\/in\/taylor/);
  assert.match(body, /Warmly,\nTaylor Reed/);
});

test("Zoom copy asks for a multimedia follow-up and inserts available times", () => {
  const body = buildZoomInviteEmailBody(
    { intervieweeName: "Alex Morgan" },
    {
      name: "Taylor Reed",
      schedulingLink: "https://calendly.com/taylor/follow-up",
      signature: "Taylor Reed\nAuthority Magazine",
    }
  );

  assert.match(body, /Your answers were fantastic/);
  assert.match(body, /follow-up Zoom interview/);
  assert.match(body, /multimedia element/);
  assert.match(body, /https:\/\/calendly\.com\/taylor\/follow-up/);
  assert.match(body, /Taylor Reed\nAuthority Magazine/);
});

test("email recipient builder keeps CC addresses as separate provider recipients", () => {
  const recipients = buildInterviewEmailRecipients({
    intervieweeEmail: "guest@example.com",
    publicistEmail: "pr@example.com",
    clientEmail: "client@example.com",
  });

  assert.equal(recipients.recipient, "guest@example.com");
  assert.deepEqual(recipients.cc, ["pr@example.com", "client@example.com"]);
  assert.equal(recipients.ccDisplay, "pr@example.com, client@example.com");
});

test("email recipient builder trims addresses and avoids duplicate CCs", () => {
  const recipients = buildInterviewEmailRecipients({
    intervieweeEmail: "  guest@example.com ",
    publicistEmail: "PR@example.com",
    clientEmail: " pr@example.com ",
  });

  assert.equal(recipients.recipient, "guest@example.com");
  assert.deepEqual(recipients.cc, ["PR@example.com"]);
  assert.equal(recipients.ccDisplay, "PR@example.com");
});
