const { Client } = require("pg");
const bcrypt = require("bcryptjs");

const connectionString = "postgresql://neondb_owner:npg_CYGv30ktBIbf@ep-purple-cell-adq2ksq2.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  console.log("Connecting to Neon PostgreSQL...");
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false, // matches Prisma's default behavior for SSL
    },
  });

  try {
    await client.connect();
    console.log("Connected successfully!");

    const email = "support@authoritymag.co";
    const password = "Thought@Leader";
    console.log("Hashing password...");
    const passwordHash = await bcrypt.hash(password, 12);
    const adminId = "cmqafp9pq0000g2wcrxgqnx9d";

    // Check if user already exists
    const checkRes = await client.query('SELECT id, email FROM "User" WHERE email = $1;', [email]);
    if (checkRes.rows.length > 0) {
      console.log(`Admin user ${email} already exists (ID: ${checkRes.rows[0].id}). Updating credentials...`);
      await client.query(
        'UPDATE "User" SET "passwordHash" = $1, role = $2, name = $3, "updatedAt" = NOW() WHERE id = $4;',
        [passwordHash, "ADMIN", "Admin", checkRes.rows[0].id]
      );
    } else {
      console.log(`Admin user ${email} does not exist. Inserting new admin account...`);
      await client.query(
        'INSERT INTO "User" (id, email, "passwordHash", name, role, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW());',
        [adminId, email, passwordHash, "Admin", "ADMIN"]
      );
    }

    console.log("Seed successful!");

    // Verify admin users
    const verifyRes = await client.query('SELECT id, email, role, name FROM "User" WHERE role = $1;', ["ADMIN"]);
    console.log("Admin users in PostgreSQL database:");
    console.log(verifyRes.rows);

  } catch (err) {
    console.error("Error seeding Neon PostgreSQL database:", err);
    process.exit(1);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

main();
