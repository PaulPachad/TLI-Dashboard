import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }

      for (const listener of this.listeners.get(message.method) ?? []) {
        listener(message.params);
      }
    });

    await new Promise((resolvePromise, rejectPromise) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", rejectPromise, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, {
        resolve: resolvePromise,
        reject: rejectPromise,
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() {
    this.socket?.close();
  }
}

const root = resolve(import.meta.dirname, "..");
const outputDir = join(root, "artifacts", "visual-smoke");
const chromePath =
  process.env.CHROME_PATH ||
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find(existsSync);
const chromeProfile = join(
  tmpdir(),
  `tli-visual-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`
);
const appUrl = "http://127.0.0.1:3000";
const browserUrl = "http://127.0.0.1:9222";
const report = {
  screenshots: [],
  pages: {},
  consoleErrors: [],
  failedResponses: [],
};

mkdirSync(outputDir, { recursive: true });

const app = spawn(
  process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
  ["/d", "/s", "/c", "npm.cmd run dev:demo"],
  {
  cwd: root,
  env: {
    ...process.env,
    DATABASE_URL: "file:./dev.db",
    NEXTAUTH_SECRET:
      "local-demo-secret-key-for-tli-leverage-dashboard-mvp-seeding-123456",
    NEXTAUTH_URL: appUrl,
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_PASSWORD: "admin123",
    DEMO_MODE: "true",
    NEXT_PUBLIC_DEMO_MODE: "true",
  },
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

let chrome;
let cdp;

try {
  if (!chromePath) {
    throw new Error(
      "Chrome or Edge was not found. Set CHROME_PATH to a Chromium browser executable."
    );
  }
  await waitFor(async () => {
    const response = await fetch(`${appUrl}/login`);
    return response.ok;
  }, 60_000, "Next.js server");

  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=9222",
      `--user-data-dir=${chromeProfile}`,
      "--window-size=1440,1000",
      "about:blank",
    ],
    {
      windowsHide: true,
      stdio: "ignore",
    }
  );

  const pageTarget = await waitFor(async () => {
    const response = await fetch(`${browserUrl}/json/list`);
    if (!response.ok) return null;
    const targets = await response.json();
    return targets.find((target) => target.type === "page") || null;
  }, 30_000, "Chrome page target");

  cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Network.enable"),
    cdp.send("Log.enable"),
  ]);

  cdp.on("Runtime.exceptionThrown", (event) => {
    report.consoleErrors.push(
      event.exceptionDetails?.exception?.description ||
        event.exceptionDetails?.text ||
        "Unknown browser exception"
    );
  });
  cdp.on("Log.entryAdded", (event) => {
    if (event.entry?.level === "error") {
      report.consoleErrors.push(event.entry.text);
    }
  });
  cdp.on("Network.responseReceived", (event) => {
    if (
      event.response?.status >= 400 &&
      !event.response.url.endsWith("/favicon.ico")
    ) {
      report.failedResponses.push({
        status: event.response.status,
        url: event.response.url,
      });
    }
  });

  await setViewport(1440, 1000, false);
  await navigate("/login");
  await waitForSelector("#login-submit");
  await capture("login-desktop");

  await evaluate(`
    (() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      ).set;
      const email = document.querySelector("#login-email");
      const password = document.querySelector("#login-password");
      setValue.call(email, "admin@example.com");
      email.dispatchEvent(new Event("input", { bubbles: true }));
      setValue.call(password, "admin123");
      password.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("form").requestSubmit();
    })()
  `);
  await waitForLocation("/dashboard");
  await waitForSelector('[id^="interview-card-"]');
  report.pages.dashboardDesktop = await inspectPage();
  await capture("dashboard-desktop");

  await evaluate(
    `document.querySelector('[id^="view-details-"]')?.click()`
  );
  await waitForSelector('[aria-label="Interview details"]');
  report.pages.detailPanel = await inspectPage();
  await capture("detail-panel-desktop");
  await evaluate(`document.querySelector("#close-detail-panel")?.click()`);

  await navigate("/admin");
  await waitForSelector("#admin-manage-clients");
  report.pages.adminDesktop = await inspectPage();
  await capture("admin-desktop");

  await navigate("/admin/clients");
  await waitForSelector("#create-client-link");
  report.pages.clientsDesktop = await inspectPage();
  await capture("clients-desktop");

  await navigate("/admin/import");
  await waitForSelector("#client-select");
  report.pages.importDesktop = await inspectPage();
  await capture("import-desktop");

  await setViewport(390, 844, true);
  await navigate("/dashboard");
  await waitForSelector('[id^="interview-card-"]');
  report.pages.dashboardMobile = await inspectPage();
  await capture("dashboard-mobile");

  await evaluate(`document.querySelector("#sidebar-toggle")?.click()`);
  await waitForSelector("#sidebar-close");
  report.pages.sidebarMobile = await inspectPage();
  await capture("sidebar-mobile");
  await evaluate(`document.querySelector("#sidebar-close")?.click()`);

  await evaluate(
    `document.querySelector('[id^="send-live-email-"]')?.click()`
  );
  await waitForSelector('[aria-label="Interview action"]');
  report.pages.actionModalMobile = await inspectPage();
  await capture("action-modal-mobile");

  report.consoleErrors = [...new Set(report.consoleErrors)];
  report.failedResponses = report.failedResponses.filter(
    (item, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.status === item.status && candidate.url === item.url
      ) === index
  );

  writeFileSync(
    join(outputDir, "report.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error);
  console.error(appOutput.slice(-4000));
  process.exitCode = 1;
} finally {
  cdp?.close();
  stopProcessTree(chrome);
  stopProcessTree(app);
  if (chromeProfile.startsWith(tmpdir())) {
    try {
      rmSync(chromeProfile, { recursive: true, force: true });
    } catch {
      // Chrome can briefly retain Windows profile locks after process exit.
    }
  }
}

async function setViewport(width, height, mobile) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
}

async function navigate(pathname) {
  await cdp.send("Page.navigate", { url: `${appUrl}${pathname}` });
  await waitFor(async () => {
    const state = await evaluate(`document.readyState`);
    return state === "complete";
  }, 20_000, `page ${pathname}`);
}

async function waitForSelector(selector) {
  await waitFor(
    async () => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`),
    20_000,
    `selector ${selector}`
  );
}

async function waitForLocation(pathname) {
  await waitFor(
    async () => {
      const location = await evaluate(`window.location.pathname`);
      return location === pathname;
    },
    20_000,
    `location ${pathname}`
  );
}

async function inspectPage() {
  return evaluate(`
    (() => ({
      path: window.location.pathname,
      title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() || null,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      },
      hasHorizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
      visibleDialogs: [...document.querySelectorAll('[role="dialog"]')]
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        }).length,
      interviewCards: document.querySelectorAll('[id^="interview-card-"]').length
    }))()
  `);
}

async function capture(name) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const path = join(outputDir, `${name}.png`);
  writeFileSync(path, Buffer.from(result.data, "base64"));
  report.screenshots.push(path);
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text
    );
  }
  return result.result?.value;
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
