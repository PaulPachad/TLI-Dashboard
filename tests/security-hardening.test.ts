import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminClientUpdateError,
  normalizeAdminClientUpdate,
  selectClientLoginUser,
} from "../src/lib/clients/admin-update";
import {
  isPrivateIpAddress,
  parseRemoteImageUrl,
  remoteImageUrlToDataUrl,
} from "../src/lib/images/remote-image";

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
