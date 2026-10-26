const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

process.env.DATABASE_URL = "postgresql://postgres.xheuchraxuwqftxjqynq:TM5G2*%40%40WhWKXT6@aws-0-us-west-2.pooler.supabase.com:5432/postgres?schema=tli&sslmode=require";

const db = new PrismaClient();

const DEFAULT_TEMPLATES = [
  {
    templateKey: "pitch_acceptance",
    name: "Pitch acceptance",
    subject: "Authority Magazine - {series_name} Interview Invitation",
    allowedVariables: ["series_name", "interview_link", "signature", "review_note"],
    body: `Thank you so much for your pitch to Authority Magazine.

You have been accepted and we would like to move forward with an email interview.

Here is the link for the email interview questions for this series:

{series_name}
{interview_link}

Please complete the written interview, (please do not use AI to create your answers) and upload the interview, images and bio into the portal linked at the bottom of the interview when it is complete.

When you upload the material, please keep your browser open until you see a confirmation message.

The official deadline is 21 days.

After you upload the interview in the writer's portal, you will see a link to a spreadsheet queue with our estimated publishing dates.

All other details and frequently asked questions are addressed here: https://bit.ly/AuthorityMagFAQandInstructions

We look forward to seeing your interview submission!

Warmly,
{signature}`,
  },
  {
    templateKey: "pitch_no_match",
    name: "Pitch no match",
    subject: "Authority Magazine - Please Select an Interview Series",
    allowedVariables: ["signature"],
    body: `Hi there!

Thank you for your interest in Authority Magazine.

Can you please choose one of our ongoing interview series topics from our list here:
[📚 Browse Ongoing Interview Series](https://medium.com/authority-magazine/ongoing-interview-series-in-authority-magazine-7d633a349753)

If you'd like help finding the best match, you can ask our AI Bot here:
[🤖 Ask Authority Magazine AI Bot](https://chatgpt.com/g/g-DOnEg59Sc-authority-magazine-bot)

Once you've selected a topic that fits your expertise, please submit your selection in our pitch form here:
[📝 Submit Pitch Form](https://docs.google.com/forms/d/e/1FAIpQLSdkUiiJpgE53-I6pDQOm-zWveNeCXkGFonoVX5ULmN0dPsfxA/viewform)

Best regards,
Authority Magazine Editorial Team`,
  },
  {
    templateKey: "pitch_multiple_match",
    name: "Pitch multiple matches",
    subject: "Authority Magazine - Interview Invitation",
    allowedVariables: ["series_list", "signature"],
    body: `Thank you so much for your pitch to Authority Magazine. 

You have been accepted and we would like to move forward with an email interview. 

Based on your pitch, here is the interview series that fits your expertise. Please click the link below to get started:

{series_list}

Please complete the written interview, (please do not use AI to create your answers) and upload the interview, images and bio into the portal linked at the bottom of the interview when it is complete.

When you upload the material, please keep your browser open until you see a confirmation message.

The official deadline is 21 days.
 
After you upload the interview in the writer's portal, you will see a link to a spreadsheet queue with our estimated publishing dates.
 
All other details and frequently asked questions are addressed here: https://bit.ly/AuthorityMagFAQandInstructions   
 
We look forward to seeing your interview submission!
 
Warmly,
Yitzi`,
  },
  {
    templateKey: "pitch_extension",
    name: "Deadline extension",
    subject: "Re: {original_subject}",
    allowedVariables: ["original_subject"],
    body: "Sure! :-)",
  },
  {
    templateKey: "collab_acceptance",
    name: "Collaboration form match",
    subject: "Re: {original_subject}",
    allowedVariables: ["original_subject", "topic_name", "form_url", "signature"],
    body: `Sure we'd love to include you in this series.

Can you add your basic info in the form here?

{topic_name}
{form_url}

After the pitches come in we will send you the interview questions.

I look forward!

Yitzi`,
  },
  {
    templateKey: "collab_no_match",
    name: "Collaboration no match",
    subject: "Re: {original_subject}",
    allowedVariables: ["original_subject", "signature"],
    body: `Thank you for reaching out to Authority Magazine!

We'd love to consider you for one of our ongoing interview series. To make sure we connect you with the right series, could you share a bit more about your area of expertise or the topic you're pitching on?

Once we know more, we'll send you the correct submission form.

Looking forward to hearing from you!`,
  },
  {
    templateKey: "generic_response",
    name: "Daily generic response",
    subject: "Thank you for your pitch to Authority Magazine - Let's take the next step!",
    allowedVariables: ["signature", "original_subject"],
    body: `Hi There!

Thank you so much for sending your press release or pitch to Authority Magazine. We appreciate your interest and would be happy to conduct an email interview with you.

To get started, please review our available interview storylines below:

[**Interview Storylines**](https://medium.com/authority-magazine/ongoing-interview-series-in-authority-magazine-7d633a349753)

We're also excited to announce these upcoming storylines:

[**Upcoming Storylines**](https://medium.com/authority-magazine/new-interview-series-topics-we-are-working-on-bdae530b5bf4)

If you are unsure about which topic is best for you, you can ask our AI Bot to recommend a few ideas for you. All you have to do is add your bio to the link below.

[**Add Your Bio Here**](https://chatgpt.com/g/g-DOnEg59Sc-authority-magazine-bot)

Please take a moment to choose the best fit for your interview. Once you've made your selection, click the link below to provide your basic information, and we'll be in touch shortly with our interview questions.

[**Add Your Basic Info Here**](https://docs.google.com/forms/d/e/1FAIpQLSdkUiiJpgE53-I6pDQOm-zWveNeCXkGFonoVX5ULmN0dPsfxA/viewform)

Looking forward to learning more about you and your story!

Best regards,

    Yitzi Weiner
    Editor-In-Chief,
    Authority Magazine`,
  },
];

const DEFAULT_SUPPRESSIONS = [
  { kind: "PHRASE", value: "unsubscribe", reason: "Automated newsletter or blast email" },
  { kind: "PHRASE", value: "opt out", reason: "Automated broadcast footer" },
  { kind: "PHRASE", value: "privacy policy", reason: "Transactional or mass distribution email" },
  { kind: "PHRASE", value: "all rights reserved", reason: "Automated distribution footer" },
];

async function main() {
  console.log("Seeding Supabase tli schema...");

  // 1. Admin user
  const adminEmail = "support@authoritymag.co";
  const adminPasswordHash = await bcrypt.hash("Thought@Leader", 12);
  const adminUser = await db.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      name: "Admin",
    },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      name: "Admin",
      role: "ADMIN",
    },
  });
  console.log(`✓ Admin user: ${adminUser.email} (role: ${adminUser.role})`);

  // 2. Automation Profile
  const profileId = "cmu33oak70000rtrc0ztj4dxo";
  const profile = await db.automationProfile.upsert({
    where: { id: profileId },
    update: {
      name: "Authority Magazine Automation",
      description: "Draft-only control center for Authority Magazine email automation.",
      mode: "DRAFT_ONLY",
      matchThreshold: 90,
      multipleChoiceGap: 6,
      maxMatches: 3,
      skipPhrasesJson: DEFAULT_SUPPRESSIONS.map((item) => item.value),
    },
    create: {
      id: profileId,
      name: "Authority Magazine Automation",
      description: "Draft-only control center for Authority Magazine email automation.",
      mode: "DRAFT_ONLY",
      matchThreshold: 90,
      multipleChoiceGap: 6,
      maxMatches: 3,
      skipPhrasesJson: DEFAULT_SUPPRESSIONS.map((item) => item.value),
      blockedSendersJson: [],
      blockedDomainsJson: [],
    },
  });
  console.log(`✓ Automation Profile: ${profile.id} (${profile.name})`);

  // 3. Mailboxes & Bridge Tokens
  const mailboxes = [
    {
      id: "cmqpo8q9o0001js04w3mm4gik",
      label: "Support Pitch Inbox",
      emailAddress: "support@authoritymag.co",
      workflowType: "PITCH_RESPONDER",
      token: "am_bridge_cmqpo8q9o0001js04w3mm4gik_ibGeLz41O7g22QhLy1SeW1xoRA4HCEzB",
    },
    {
      id: "cmqpo8q9o0002js04j1ky7kov",
      label: "Collaboration Inbox",
      emailAddress: "articlecollaborationteam@gmail.com",
      workflowType: "COLLAB_RESPONDER",
      token: "am_bridge_cmqpo8q9o0002js04j1ky7kov_vmHKyvb3iGKw76ylQPW0m9AvvLMmMV2d",
    },
    {
      id: "cmu34ksgv0005jt04url7fg0o",
      label: "Editor Inbox",
      emailAddress: "editor@authoritymag.co",
      workflowType: "GENERIC_RESPONSE",
      token: "am_bridge_cmu34ksgv0005jt04url7fg0o_8LzvKxjrqXpM8f52taNa6USnXWCa76qN",
    },
    {
      id: "cmu5egrnh0007rt8k9utdsy96",
      label: "Master Dashboard Queue Updater",
      emailAddress: "master-dashboard@authoritymag.co",
      workflowType: "MASTER_DASHBOARD_UPDATER",
      token: null,
    },
    {
      id: "cmu5egro10009rt8kxw81ur7i",
      label: "Friday Marketing Automation",
      emailAddress: "friday-automation@authoritymag.co",
      workflowType: "AUTHORITY_PRESS_MARKETING",
      token: null,
    },
  ];

  for (const m of mailboxes) {
    const bridgeTokenHash = m.token
      ? crypto.createHash("sha256").update(m.token, "utf8").digest("hex")
      : null;
    const bridgeTokenPreview = m.token ? `...${m.token.slice(-6)}` : null;

    const mb = await db.automationMailbox.upsert({
      where: { id: m.id },
      update: {
        profileId: profile.id,
        label: m.label,
        emailAddress: m.emailAddress,
        workflowType: m.workflowType,
        authStatus: "OK",
        bridgeStatus: m.token ? "TOKEN_READY" : "NEVER_CONNECTED",
        bridgeTokenHash,
        bridgeTokenPreview,
        bridgeTokenRotatedAt: m.token ? new Date() : null,
      },
      create: {
        id: m.id,
        profileId: profile.id,
        label: m.label,
        emailAddress: m.emailAddress,
        workflowType: m.workflowType,
        authStatus: "OK",
        bridgeStatus: m.token ? "TOKEN_READY" : "NEVER_CONNECTED",
        bridgeTokenHash,
        bridgeTokenPreview,
        bridgeTokenRotatedAt: m.token ? new Date() : null,
        isEnabled: false,
      },
    });
    console.log(`✓ Mailbox: ${mb.emailAddress} (${mb.workflowType}) -> Token preview: ${mb.bridgeTokenPreview}`);
  }

  // 4. Automation Workflows for Editor Mailbox
  const editorMailboxId = "cmu34ksgv0005jt04url7fg0o";
  await db.automationWorkflow.upsert({
    where: {
      mailboxId_key: {
        mailboxId: editorMailboxId,
        key: "generic_response_daily",
      },
    },
    update: {
      profileId: profile.id,
      name: "Daily generic pitch responses",
      description: "Replies to all pitch emails in the red generic-response queue every morning at 10 a.m. New York time.",
      isEnabled: true,
      mode: "DRAFT_ONLY",
      timezone: "America/New_York",
      scheduleHour: 10,
      scheduleMinute: 0,
      dailyCap: 50,
      batchSize: 10,
      queueLabelName: "red generic-response",
    },
    create: {
      profileId: profile.id,
      mailboxId: editorMailboxId,
      key: "generic_response_daily",
      name: "Daily generic pitch responses",
      description: "Replies to all pitch emails in the red generic-response queue every morning at 10 a.m. New York time.",
      isEnabled: true,
      mode: "DRAFT_ONLY",
      timezone: "America/New_York",
      scheduleHour: 10,
      scheduleMinute: 0,
      dailyCap: 50,
      batchSize: 10,
      queueLabelName: "red generic-response",
    },
  });
  console.log("✓ Automation Workflow: generic_response_daily configured");

  // 5. Automation Templates
  for (const t of DEFAULT_TEMPLATES) {
    await db.automationTemplate.upsert({
      where: {
        profileId_templateKey: {
          profileId: profile.id,
          templateKey: t.templateKey,
        },
      },
      update: {
        name: t.name,
        subject: t.subject,
        body: t.body,
        allowedVariablesJson: t.allowedVariables,
      },
      create: {
        profileId: profile.id,
        templateKey: t.templateKey,
        name: t.name,
        subject: t.subject,
        body: t.body,
        allowedVariablesJson: t.allowedVariables,
      },
    });
  }
  console.log(`✓ Templates seeded (${DEFAULT_TEMPLATES.length} templates)`);

  // 6. Suppressions
  for (const s of DEFAULT_SUPPRESSIONS) {
    const existing = await db.suppressionEntry.findFirst({
      where: {
        profileId: profile.id,
        kind: s.kind,
        value: s.value,
      },
    });
    if (!existing) {
      await db.suppressionEntry.create({
        data: {
          profileId: profile.id,
          kind: s.kind,
          value: s.value,
          reason: s.reason,
        },
      });
    }
  }
  console.log("✓ Suppression entries seeded");

  // 7. Client & User: Tavares Beverly
  const tavaresEmail = "tavaresbev@gmail.com";
  let client = await db.client.findFirst({
    where: { email: tavaresEmail },
  });

  if (!client) {
    client = await db.client.create({
      data: {
        name: "Tavares Beverly",
        email: tavaresEmail,
        company: "Authority Magazine",
        title: "Contributing Writer / Columnist",
        replyToEmail: tavaresEmail,
        defaultHashtags: "#AuthorityMagazine #ThoughtLeadership #Leadership #Interview",
        defaultSignoff: "Warmly",
      },
    });
  } else {
    client = await db.client.update({
      where: { id: client.id },
      data: {
        name: "Tavares Beverly",
        company: "Authority Magazine",
        title: "Contributing Writer / Columnist",
        replyToEmail: tavaresEmail,
      },
    });
  }
  console.log(`✓ Client Tavares Beverly: ${client.id} (${client.email})`);

  const clientPasswordHash = await bcrypt.hash("Thought@Leader", 12);
  const user = await db.user.upsert({
    where: { email: tavaresEmail },
    update: {
      name: "Tavares Beverly",
      role: "CLIENT",
      clientId: client.id,
      passwordHash: clientPasswordHash,
    },
    create: {
      email: tavaresEmail,
      name: "Tavares Beverly",
      role: "CLIENT",
      clientId: client.id,
      passwordHash: clientPasswordHash,
    },
  });
  console.log(`✓ User Tavares Beverly: ${user.email} (role: ${user.role}, clientId: ${user.clientId})`);

  // Sheet Source for Tavares Beverly
  const sheetUrl = "https://docs.google.com/spreadsheets/d/1e7CSCHem8HyDWBt2rzdmju-t7kdPpVUW5CAf_io20Eo/edit?resourcekey=&gid=892423731#gid=892423731";
  const spreadsheetId = "1e7CSCHem8HyDWBt2rzdmju-t7kdPpVUW5CAf_io20Eo";
  const gid = "892423731";

  let sheetSource = await db.sheetSource.findFirst({
    where: { clientId: client.id, spreadsheetId },
  });

  if (!sheetSource) {
    sheetSource = await db.sheetSource.create({
      data: {
        clientId: client.id,
        sheetUrl,
        spreadsheetId,
        gid,
        sheetTitle: "Active",
      },
    });
  } else {
    sheetSource = await db.sheetSource.update({
      where: { id: sheetSource.id },
      data: {
        sheetUrl,
        gid,
        sheetTitle: "Active",
      },
    });
  }
  console.log(`✓ Sheet Source for Tavares: ${sheetSource.id} (${sheetSource.spreadsheetId})`);

  console.log("\nALL SEEDING COMPLETE!");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
