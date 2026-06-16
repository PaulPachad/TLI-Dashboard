import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = resolve(import.meta.dirname, "..");
const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
const databasePath = resolveSqlitePath(databaseUrl);

const diffResult = spawnSync(
  process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
  [
    "/d",
    "/s",
    "/c",
    "npx.cmd prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.sqlite.prisma --script",
  ],
  {
    cwd: root,
    env: process.env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }
);

if (diffResult.status !== 0) {
  process.stderr.write(diffResult.stdout);
  process.stderr.write(diffResult.stderr);
  console.error("Failed to generate SQLite schema SQL.");
  process.exit(1);
}

const sql = stripPrismaNoise(diffResult.stdout.toString());
mkdirSync(dirname(databasePath), { recursive: true });
if (existsSync(databasePath)) {
  rmSync(databasePath, { force: true });
}

const db = new DatabaseSync(databasePath);
try {
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(sql);
  db.exec("PRAGMA foreign_keys = ON;");
} finally {
  db.close();
}

console.log(`Prepared SQLite database at ${databasePath}`);

function resolveSqlitePath(url) {
  if (!url.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a SQLite file: URL for demo setup.");
  }

  const value = url.slice("file:".length);
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return resolve(value);
  }
  if (value.startsWith("/")) {
    return value;
  }

  return resolve(root, "prisma", value);
}

function stripPrismaNoise(output) {
  const loadedConfigIndex = output.indexOf("Loaded Prisma config");
  return (loadedConfigIndex === -1
    ? output
    : output.slice(0, loadedConfigIndex)
  ).trim();
}
