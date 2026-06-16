import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

// Regenerate the Prisma client for SQLite so this test works regardless of
// which schema was last used by `npm run build` (which targets PostgreSQL).
const generatedSchema = readFileSync(
  resolve(root, "node_modules", ".prisma", "client", "schema.prisma"),
  "utf8"
);
if (!generatedSchema.includes('provider = "sqlite"')) {
  const regenResult = spawnSync(
    process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
    ["/d", "/s", "/c", "npx.cmd prisma generate --schema prisma/schema.sqlite.prisma"],
    { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
  );
  if (regenResult.status !== 0) {
    process.stderr.write(regenResult.stderr);
    console.error("Failed to regenerate SQLite Prisma client");
    process.exit(1);
  }
}

const { PrismaClient } = await import("@prisma/client");

const appPort = 3100 + Math.floor(Math.random() * 500);
const appUrl = `http://127.0.0.1:${appPort}`;
mkdirSync("C:\\tmp", { recursive: true });
const temporaryDatabaseName =
  `http-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}.db`;
const temporaryDatabasePath = resolve(root, "prisma", temporaryDatabaseName);
const databaseUrl = `file:./${temporaryDatabaseName}`;
process.env.DATABASE_URL = databaseUrl;
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  NEXTAUTH_SECRET:
    "local-demo-secret-key-for-tli-leverage-dashboard-mvp-seeding-123456",
  NEXTAUTH_URL: appUrl,
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "admin123",
  DEMO_MODE: "true",
  NEXT_PUBLIC_DEMO_MODE: "true",
};
const prepareResult = spawnSync(
  process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
  [
    "/d",
    "/s",
    "/c",
    "node scripts/prepare-sqlite-demo.mjs && npx.cmd prisma db seed --schema prisma/schema.sqlite.prisma",
  ],
  {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }
);
if (prepareResult.status !== 0) {
  process.stderr.write(prepareResult.stdout);
  process.stderr.write(prepareResult.stderr);
  console.error("Failed to prepare HTTP smoke database");
  process.exit(1);
}
const db = new PrismaClient();
const app = spawn(
  process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
  ["/d", "/s", "/c", `npx.cmd next dev -p ${appPort}`],
  {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let appOutput = "";
app.stdout.on("data", (chunk) => {
  appOutput += chunk.toString();
});
app.stderr.on("data", (chunk) => {
  appOutput += chunk.toString();
});

let shareReadyInterview;
let linkedinPostUrl;

try {
  const demoClient = await db.client.findFirstOrThrow({
    where: { email: "demo.client@example.com" },
  });
  const otherClient =
    (await db.client.findFirst({
      where: { id: { not: demoClient.id } },
    })) ||
    (await db.client.create({
      data: {
        name: "HTTP Smoke Other Client",
        email: `http-smoke-${Date.now()}@example.com`,
      },
    }));
  const smokeSource = await db.sheetSource.create({
    data: {
      clientId: demoClient.id,
      sheetUrl:
        "https://docs.google.com/spreadsheets/d/http-smoke-sheet/edit#gid=0",
      spreadsheetId: "http-smoke-sheet",
      gid: "0",
      sheetTitle: "HTTP Smoke Fixtures",
      lastSyncedAt: new Date(),
    },
  });
  shareReadyInterview = await db.interview.create({
    data: {
      clientId: demoClient.id,
      sheetSourceId: smokeSource.id,
      sourceRowNumber: 2,
      sourceRowHash: "http-smoke-share",
      intervieweeName: "HTTP Smoke Guest",
      intervieweeEmail: "smoke@example.com",
      topic: "HTTP smoke testing",
      articleUrl:
        "https://medium.com/authority-magazine/http-smoke-guest-123",
    },
  });
  await db.action.createMany({
    data: [
      {
        clientId: demoClient.id,
        interviewId: shareReadyInterview.id,
        actionType: "LIVE_EMAIL_SENT",
        status: "SUCCESS",
        recipient: "smoke@example.com",
        subject: "HTTP smoke live-link prerequisite",
        body: "HTTP smoke live-link prerequisite",
      },
      {
        clientId: demoClient.id,
        interviewId: shareReadyInterview.id,
        actionType: "LINKEDIN_POST_GENERATED",
        status: "SUCCESS",
        generatedText: "HTTP smoke LinkedIn prerequisite",
      },
    ],
  });

  await waitFor(async () => {
    const response = await fetch(`${appUrl}/login`);
    return response.ok;
  }, 60_000, "Next.js server");

  const unauthenticated = await fetch(`${appUrl}/api/interviews`);
  assert.equal(unauthenticated.status, 401);

  const clientSessionCookie = await signIn(
    "demo.client@example.com",
    "DemoClient123!"
  );
  const clientHeaders = {
    Cookie: clientSessionCookie,
    "Content-Type": "application/json",
  };
  const clientDashboard = await fetch(`${appUrl}/dashboard`, {
    headers: { Cookie: clientSessionCookie },
  });
  assert.equal(clientDashboard.status, 200);
  const ownImport = await postJson(
    "/api/import-google-sheet",
    { clientId: demoClient.id, sheetUrl: "not-a-google-sheet" },
    clientHeaders
  );
  assert.equal(ownImport.response.status, 400);
  assert.match(ownImport.data.error, /does not look like a Google Sheets URL/);
  const crossClientImport = await postJson(
    "/api/import-google-sheet",
    { clientId: otherClient.id, sheetUrl: "not-a-google-sheet" },
    clientHeaders
  );
  assert.equal(crossClientImport.response.status, 403);

  const sessionCookie = await signIn("admin@example.com", "admin123");
  const headers = {
    Cookie: sessionCookie,
    "Content-Type": "application/json",
  };

  const invalidLinkedInUrl = await postJson(
    `/api/interviews/${shareReadyInterview.id}/action`,
    {
      actionType: "mark_shared",
      data: { linkedinPostUrl: "https://example.com/not-linkedin" },
    },
    headers
  );
  assert.equal(invalidLinkedInUrl.response.status, 400);

  linkedinPostUrl =
    `https://www.linkedin.com/posts/tli-smoke-${Date.now()}`;
  const shared = await postJson(
    `/api/interviews/${shareReadyInterview.id}/action`,
    {
      actionType: "mark_shared",
      data: { linkedinPostUrl },
    },
    headers
  );
  assert.equal(shared.response.status, 200);

  const urlAction = await db.action.findFirst({
    where: {
      interviewId: shareReadyInterview.id,
      actionType: "LINKEDIN_URL_ADDED",
      linkedinPostUrl,
    },
  });
  assert.ok(urlAction, "LinkedIn URL action should be recorded");

  console.log(
    JSON.stringify(
      {
        unauthenticatedApi: unauthenticated.status,
        clientDashboard: clientDashboard.status,
        ownClientImport: ownImport.response.status,
        crossClientImport: crossClientImport.response.status,
        linkedInUrlRecorded: Boolean(urlAction),
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(error);
  console.error(appOutput.slice(-4000));
  process.exitCode = 1;
} finally {
  stopProcessTree(app);
  app.stdout.destroy();
  app.stderr.destroy();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
  await db.$disconnect();
  rmSync(temporaryDatabasePath, { force: true });
}

process.exit(process.exitCode ?? 0);

async function signIn(email, password) {
  const csrfResponse = await fetch(`${appUrl}/api/auth/csrf`);
  const csrf = await csrfResponse.json();
  let cookie = collectCookies(csrfResponse);

  const response = await fetch(`${appUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email,
      password,
      callbackUrl: `${appUrl}/dashboard`,
    }),
  });
  cookie = mergeCookies(cookie, collectCookies(response));
  assert.ok(
    response.status === 302 || response.status === 303,
    `Expected auth redirect, received ${response.status}`
  );
  assert.match(cookie, /session-token/);
  return cookie;
}

async function postJson(pathname, body, headers) {
  const response = await fetch(`${appUrl}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

function collectCookies(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

function mergeCookies(current, incoming) {
  const values = new Map();
  for (const cookie of `${current}; ${incoming}`.split(";")) {
    const trimmed = cookie.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    values.set(trimmed.slice(0, separator), trimmed.slice(separator + 1));
  }
  return [...values.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function waitFor(operation, timeout, label) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeout) {
    try {
      const value = await operation();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(
    `Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`
  );
}

function stopProcessTree(processHandle) {
  if (!processHandle?.pid) return;
  spawnSync("taskkill", ["/pid", String(processHandle.pid), "/T", "/F"], {
    windowsHide: true,
    stdio: "ignore",
  });
}
