import assert from "node:assert/strict";
import test from "node:test";
import { getInterviewProgress } from "../src/lib/actions/progress";
import {
  generateLinkedInVariations,
  normalizeLinkedInPostUrl,
} from "../src/lib/linkedin/generator";

const contact = {
  intervieweeEmail: "guest@example.com",
  publicistEmail: null,
};

test("next action follows the complete leverage workflow", () => {
  assert.equal(
    getInterviewProgress({
      intervieweeEmail: null,
      publicistEmail: null,
      actions: [],
    }).nextAction,
    "add_contact"
  );
  assert.equal(getInterviewProgress({ ...contact, actions: [] }).nextAction, "send_live_email");

  const liveSent = [{ actionType: "LIVE_EMAIL_SENT", status: "SUCCESS" }];
  assert.equal(
    getInterviewProgress({ ...contact, actions: liveSent }).nextAction,
    "generate_linkedin"
  );

  const generated = [
    ...liveSent,
    { actionType: "LINKEDIN_POST_GENERATED", status: "SUCCESS" },
  ];
  assert.equal(
    getInterviewProgress({ ...contact, actions: generated }).nextAction,
    "mark_shared"
  );

  const shared = [
    ...generated,
    { actionType: "MARKED_SHARED", status: "SUCCESS" },
  ];
  assert.equal(
    getInterviewProgress({ ...contact, actions: shared }).nextAction,
    "send_zoom_invite"
  );

  const complete = [
    ...shared,
    { actionType: "ZOOM_INVITE_SENT", status: "SUCCESS" },
  ];
  const progress = getInterviewProgress({ ...contact, actions: complete });
  assert.equal(progress.nextAction, "leveraged");
  assert.equal(progress.currentStatus, "leveraged");
});

test("failed actions do not advance interview progress", () => {
  const progress = getInterviewProgress({
    ...contact,
    actions: [{ actionType: "LIVE_EMAIL_SENT", status: "FAILED" }],
  });
  assert.equal(progress.nextAction, "send_live_email");
  assert.equal(progress.actionSummary.liveEmailSent, false);
});

test("LinkedIn generator returns three complete variations", () => {
  const articleUrl = "https://authoritymagazine.com/example";
  const variations = generateLinkedInVariations(
    {
      intervieweeName: "Alex Morgan",
      intervieweeCompany: "Example Co",
      topic: "inclusive leadership",
      articleUrl,
    },
    "#AuthorityMagazine #Leadership"
  );

  assert.equal(variations.length, 4);
  for (const variation of variations) {
    assert.match(variation, /Alex Morgan/);
    assert.match(variation, new RegExp(articleUrl.replaceAll("/", "\\/")));
    assert.match(variation, /#AuthorityMagazine/);
  }
});

test("LinkedIn post URL validation accepts LinkedIn and rejects other hosts", () => {
  assert.equal(
    normalizeLinkedInPostUrl(
      "https://www.linkedin.com/posts/example_authority-magazine-activity-123"
    ),
    "https://www.linkedin.com/posts/example_authority-magazine-activity-123"
  );
  assert.throws(
    () => normalizeLinkedInPostUrl("https://example.com/not-linkedin"),
    /linkedin\.com/i
  );
  assert.throws(() => normalizeLinkedInPostUrl("not a url"), /valid LinkedIn/i);
});
