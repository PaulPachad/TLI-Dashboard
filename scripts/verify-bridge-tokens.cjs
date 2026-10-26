const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

process.env.DATABASE_URL = "postgresql://postgres.xheuchraxuwqftxjqynq:TM5G2*%40%40WhWKXT6@aws-0-us-west-2.pooler.supabase.com:5432/postgres?schema=tli&sslmode=require";
const db = new PrismaClient();

const tokens = [
  { name: "PITCH", token: "am_bridge_cmqpo8q9o0001js04w3mm4gik_ibGeLz41O7g22QhLy1SeW1xoRA4HCEzB" },
  { name: "COLLAB", token: "am_bridge_cmqpo8q9o0002js04j1ky7kov_vmHKyvb3iGKw76ylQPW0m9AvvLMmMV2d" },
  { name: "GENERIC", token: "am_bridge_cmu34ksgv0005jt04url7fg0o_8LzvKxjrqXpM8f52taNa6USnXWCa76qN" },
];

async function main() {
  for (const item of tokens) {
    const hash = crypto.createHash("sha256").update(item.token, "utf8").digest("hex");
    const mb = await db.automationMailbox.findUnique({
      where: { bridgeTokenHash: hash },
      include: { workflows: true }
    });
    if (!mb) {
      console.error(`FAILED: ${item.name} token not found!`);
    } else {
      console.log(`✓ ${item.name} token verified: Mailbox ID=${mb.id}, email=${mb.emailAddress}, workflow=${mb.workflowType}, bridgeStatus=${mb.bridgeStatus}, workflowsCount=${mb.workflows.length}`);
    }
  }

  // Also verify Tavares Beverly user and client
  const user = await db.user.findUnique({
    where: { email: "tavaresbev@gmail.com" },
    include: { client: { include: { sheetSources: true } } }
  });
  console.log("✓ Tavares Beverly user verified:", {
    id: user.id,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    clientName: user.client?.name,
    sheetSources: user.client?.sheetSources.map(s => s.sheetUrl)
  });
}

main().finally(() => db.$disconnect());
