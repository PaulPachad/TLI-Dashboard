import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL = "postgresql://neondb_owner:npg_CYGv30ktBIbf@ep-purple-cell-adq2ksq2.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";

const db = new PrismaClient();

async function main() {
  const sources = await db.sheetSource.findMany();
  for (const source of sources) {
    console.log(`ID: ${source.id}`);
    console.log(`Client ID: ${source.clientId}`);
    console.log(`Sheet URL: ${source.sheetUrl}`);
    console.log(`Last Synced: ${source.lastSyncedAt}`);
    console.log("------------------------");
  }
  await db.$disconnect();
}

main().catch(console.error);
