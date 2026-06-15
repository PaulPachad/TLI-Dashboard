import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { UserRole } from "../src/types/db";

const prisma = new PrismaClient();
const LEGACY_SAMPLE_ARTICLE_URLS = [
  "https://medium.com/authority-magazine/rabbi-yitzi-hurwitz-on-overcoming-adversity-with-joy-123456789abc",
  "https://medium.com/authority-magazine/sara-levy-on-scaling-creative-saas-startups-987654321def",
  "https://medium.com/authority-magazine/david-goldstein-on-modern-thought-leadership-543210987ghi",
  "https://medium.com/authority-magazine/esther-rodriguez-on-ai-ethics-in-marketing-765432109jkl",
  "https://medium.com/authority-magazine/michael-green-on-sustainable-agriculture-345678901mno",
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be set in environment variables."
    );
    process.exit(1);
  }

  const passwordHash = await hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, role: UserRole.ADMIN },
    create: {
      email: adminEmail,
      passwordHash,
      name: "Admin",
      role: UserRole.ADMIN,
    },
  });

  console.log(`Admin user seeded: ${admin.email} (${admin.role})`);

  await removeLegacySampleData();

  if (process.env.DEMO_MODE === "true") {
    await seedDemoWorkspace();
  }
}

async function removeLegacySampleData() {
  const deletedInterviews = await prisma.interview.deleteMany({
    where: { articleUrl: { in: LEGACY_SAMPLE_ARTICLE_URLS } },
  });
  const deletedSources = await prisma.sheetSource.deleteMany({
    where: { spreadsheetId: "demo-sheet-id" },
  });

  if (deletedInterviews.count > 0 || deletedSources.count > 0) {
    console.log(
      `Removed ${deletedInterviews.count} legacy sample interview(s) and ` +
        `${deletedSources.count} sample sheet source(s).`
    );
  }
}

async function seedDemoWorkspace() {
  const demoEmail = "demo.client@example.com";
  const demoPasswordHash = await hash("DemoClient123!", 12);
  let client = await prisma.client.findFirst({ where: { email: demoEmail } });

  if (client) {
    client = await prisma.client.update({
      where: { id: client.id },
      data: {
        name: "Demo TLI Client",
        company: "Authority Magazine Demo",
        schedulingLink: "https://calendly.com/demo-tli/follow-up",
        replyToEmail: demoEmail,
      },
    });
  } else {
    client = await prisma.client.create({
      data: {
        name: "Demo TLI Client",
        company: "Authority Magazine Demo",
        email: demoEmail,
        schedulingLink: "https://calendly.com/demo-tli/follow-up",
        replyToEmail: demoEmail,
      },
    });
  }

  await prisma.user.upsert({
    where: { email: demoEmail },
    update: {
      passwordHash: demoPasswordHash,
      name: client.name,
      role: UserRole.CLIENT,
      clientId: client.id,
    },
    create: {
      email: demoEmail,
      passwordHash: demoPasswordHash,
      name: client.name,
      role: UserRole.CLIENT,
      clientId: client.id,
    },
  });

  console.log(`Demo client login ready: ${demoEmail} / DemoClient123!`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
