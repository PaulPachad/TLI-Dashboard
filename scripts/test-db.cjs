require('dotenv').config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const db = new PrismaClient();
  const topics = await db.topic.findMany({
    where: {
      title: {
        contains: "5 Things A Business Should Do"
      }
    }
  });
  console.log(JSON.stringify(topics, null, 2));
}
main();
