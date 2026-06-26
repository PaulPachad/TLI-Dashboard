import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminClientUpdateError,
  normalizeAdminClientUpdate,
  selectClientLoginUser,
} from "../src/lib/clients/admin-update";
import { normalizeAuthorityColumnUrl } from "../src/lib/clients/authority-column";
import {
  isInternalErrorMessage,
  toUserSafeErrorMessage,
} from "../src/lib/api/safe-error";
import {
  finishJob,
  isJobRunning,
  tryStartJob,
} from "../src/lib/jobs/idempotency";
import {
  canAccessClientResource,
  resolveRequestedClientId,
} from "../src/lib/security/tenant-access";
import {
  isPrivateIpAddress,
  parseRemoteImageUrl,
  remoteImageUrlToDataUrl,
} from "../src/lib/images/remote-image";
import {
  parseRemoteHtmlUrl,
  remoteHtmlToText,
} from "../src/lib/images/remote-html";

const existingClient = {
  id: "client_1",
  email: "old@example.com",
  replyToEmail: "old@example.com",
  users: [
    {
      id: "user_1",
      email: "old@example.com",
      role: "CLIENT",
      createdAt: new Date("2026-01-01"),
    },
  ],
};

test("admin client update normalizes email and reply-to together", () => {
  const update = normalizeAdminClientUpdate(
    {
      name: " Demo Client ",
      email: " NEW@Example.COM ",
      company: " Authority ",
    },
    existingClient
  );

  assert.deepEqual(update, {
    normalizedEmail: "new@example.com",
    newPassword: null,
    data: {
      name: "Demo Client",
      email: "new@example.com",
      company: "Authority",
      replyToEmail: "new@example.com",
    },
  });
});

test("admin client update preserves custom reply-to when email changes", () => {
  const update = normalizeAdminClientUpdate(
    { email: "new@example.com" },
    { ...existingClient, replyToEmail: "assistant@example.com" }
  );

  assert.equal(update.data.email, "new@example.com");
  assert.equal(update.data.replyToEmail, undefined);
});

test("admin client update rejects empty or invalid email changes", () => {
  assert.throws(
    () => normalizeAdminClientUpdate({ email: "not-an-email" }, existingClient),
    AdminClientUpdateError
  );
  assert.throws(
    () => normalizeAdminClientUpdate({}, existingClient),
    /No client changes/
  );
});

test("authority column URL accepts Medium and Authority Magazine links only", () => {
  assert.equal(
    normalizeAuthorityColumnUrl(" https://medium.com/@JimHamel "),
    "https://medium.com/@JimHamel"
  );
  assert.equal(
    normalizeAuthorityColumnUrl("https://authoritymagazine.com/author/jim-hamel"),
    "https://authoritymagazine.com/author/jim-hamel"
  );
  assert.equal(normalizeAuthorityColumnUrl(""), null);
  assert.throws(
    () => normalizeAuthorityColumnUrl("https://example.com/@JimHamel"),
    /Authority Magazine or Medium/
  );
});

test("admin client update saves authority column URL", () => {
  const update = normalizeAdminClientUpdate(
    { authorityColumnUrl: "https://medium.com/@JimHamel" },
    existingClient
  );

  assert.equal(update.data.authorityColumnUrl, "https://medium.com/@JimHamel");
});

test("admin client update accepts valid optional password changes", () => {
  const update = normalizeAdminClientUpdate(
    { password: "NewPass123!" },
    existingClient
  );

  assert.equal(update.normalizedEmail, null);
  assert.equal(update.newPassword, "NewPass123!");
  assert.deepEqual(update.data, {});
});

test("admin client update rejects short password changes", () => {
  assert.throws(
    () => normalizeAdminClientUpdate({ password: "short" }, existingClient),
    /at least 8 characters/
  );
});

test("client login selector prefers the account matching the client email", () => {
  const selected = selectClientLoginUser({
    ...existingClient,
    users: [
      {
        id: "secondary",
        email: "other@example.com",
        role: "CLIENT",
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "primary",
        email: "old@example.com",
        role: "CLIENT",
        createdAt: new Date("2026-01-02"),
      },
    ],
  });

  assert.equal(selected?.id, "primary");
});

test("tenant access denies client users from other client resources", () => {
  const clientUser = { role: "CLIENT", clientId: "client_a" };
  const adminUser = { role: "ADMIN", clientId: null };

  assert.equal(canAccessClientResource(clientUser, "client_a"), true);
  assert.equal(canAccessClientResource(clientUser, "client_b"), false);
  assert.equal(canAccessClientResource({ role: "CLIENT", clientId: null }, "client_a"), false);
  assert.equal(canAccessClientResource(adminUser, "client_b"), true);

  assert.equal(resolveRequestedClientId(clientUser, "client_b"), "client_a");
  assert.equal(resolveRequestedClientId(adminUser, "client_b"), "client_b");
  assert.equal(resolveRequestedClientId(adminUser, null), null);
});

test("safe API errors hide Prisma and database internals", () => {
  const rawPrismaMessage =
    "Invalid `prisma.interview.findUnique()` invocation: The column `Interview.prominenceSignalsJson` does not exist in the current database.";
  const fallback = "The feature is not available yet. Please refresh after setup.";

  assert.equal(isInternalErrorMessage(rawPrismaMessage), true);
  assert.equal(
    toUserSafeErrorMessage(new Error(rawPrismaMessage), fallback),
    fallback
  );
  assert.equal(
    toUserSafeErrorMessage({ message: "Access denied." }, fallback, {
      allowClientMessage: true,
    }),
    "Access denied."
  );
});

test("job idempotency prevents duplicate background runs in one runtime", () => {
  const key = "test-job:security-hardening";
  finishJob(key);

  assert.equal(tryStartJob(key), true);
  assert.equal(isJobRunning(key), true);
  assert.equal(tryStartJob(key), false);

  finishJob(key);
  assert.equal(isJobRunning(key), false);
  assert.equal(tryStartJob(key), true);
  finishJob(key);
});

test("remote social image URLs reject unsafe forms and private addresses", async () => {
  assert.equal(parseRemoteImageUrl("file:///etc/passwd"), null);
  assert.equal(parseRemoteImageUrl("https://user:pass@example.com/a.png"), null);
  assert.equal(isPrivateIpAddress("127.0.0.1"), true);
  assert.equal(isPrivateIpAddress("10.2.3.4"), true);
  assert.equal(isPrivateIpAddress("192.168.1.10"), true);
  assert.equal(isPrivateIpAddress("100.64.1.10"), true);
  assert.equal(isPrivateIpAddress("224.0.0.1"), true);
  assert.equal(isPrivateIpAddress("::ffff:172.16.1.10"), true);
  assert.equal(isPrivateIpAddress("203.0.113.10"), false);

  let fetchCalled = false;
  const result = await remoteImageUrlToDataUrl("http://127.0.0.1/image.png", {
    fetchImpl: async () => {
      fetchCalled = true;
      return new Response("nope");
    },
  });
  assert.equal(result, null);
  assert.equal(fetchCalled, false);
});

test("remote social image fetching enforces content type and size", async () => {
  const textResult = await remoteImageUrlToDataUrl("https://203.0.113.10/a.txt", {
    fetchImpl: async () =>
      new Response("hello", {
        headers: { "content-type": "text/plain" },
      }),
  });
  assert.equal(textResult, null);

  const oversizedResult = await remoteImageUrlToDataUrl(
    "https://203.0.113.11/a.png",
    {
      maxBytes: 4,
      fetchImpl: async () =>
        new Response("too large", {
          headers: { "content-type": "image/png" },
        }),
    }
  );
  assert.equal(oversizedResult, null);

  const imageResult = await remoteImageUrlToDataUrl(
    "https://203.0.113.12/a.png",
    {
      fetchImpl: async () =>
        new Response(Buffer.from([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        }),
    }
  );
  assert.equal(imageResult, "data:image/png;base64,AQID");
});

test("remote social image fetching does not cache failed attempts", async () => {
  let calls = 0;
  const result1 = await remoteImageUrlToDataUrl("https://203.0.113.13/a.png", {
    fetchImpl: async () => {
      calls += 1;
      return new Response("not an image", {
        headers: { "content-type": "text/plain" },
      });
    },
  });
  assert.equal(result1, null);
  assert.equal(calls, 1);

  const result2 = await remoteImageUrlToDataUrl("https://203.0.113.13/a.png", {
    fetchImpl: async () => {
      calls += 1;
      return new Response(Buffer.from([4, 5, 6]), {
        headers: { "content-type": "image/png" },
      });
    },
  });
  assert.equal(result2, "data:image/png;base64,BAUG");
  assert.equal(calls, 2);
});

test("remote article metadata fetching rejects unsafe URLs and redirects", async () => {
  assert.equal(parseRemoteHtmlUrl("file:///etc/passwd"), null);
  assert.equal(parseRemoteHtmlUrl("https://user:pass@example.com/a"), null);

  let fetchCalled = false;
  const localResult = await remoteHtmlToText("http://127.0.0.1/article", {
    fetchImpl: async () => {
      fetchCalled = true;
      return new Response("<html></html>");
    },
  });
  assert.equal(localResult, null);
  assert.equal(fetchCalled, false);

  let redirectFetches = 0;
  const redirectResult = await remoteHtmlToText("https://203.0.113.20/article", {
    fetchImpl: async () => {
      redirectFetches += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      });
    },
  });
  assert.equal(redirectResult, null);
  assert.equal(redirectFetches, 1);
});

test("remote article metadata fetching enforces allowed host, type, and size", async () => {
  const wrongHost = await remoteHtmlToText("https://203.0.113.30/article", {
    isAllowedUrl: (url) => url.hostname === "authoritymagazine.com",
    fetchImpl: async () => new Response("<html></html>"),
  });
  assert.equal(wrongHost, null);

  const textResult = await remoteHtmlToText("https://203.0.113.31/article", {
    fetchImpl: async () =>
      new Response("plain", {
        headers: { "content-type": "text/plain" },
      }),
  });
  assert.equal(textResult, null);

  const oversizedResult = await remoteHtmlToText("https://203.0.113.32/article", {
    maxBytes: 4,
    fetchImpl: async () =>
      new Response("<html>too large</html>", {
        headers: { "content-type": "text/html" },
      }),
  });
  assert.equal(oversizedResult, null);

  const htmlResult = await remoteHtmlToText("https://203.0.113.33/article", {
    fetchImpl: async () =>
      new Response("<html><title>Safe</title></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  });
  assert.equal(htmlResult, "<html><title>Safe</title></html>");
});
