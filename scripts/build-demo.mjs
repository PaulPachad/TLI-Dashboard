import { spawnSync } from "node:child_process";

const commandHost =
  process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
const result = spawnSync(
  commandHost,
  [
    "/d",
    "/s",
    "/c",
    "npx.cmd prisma generate --schema prisma/schema.sqlite.prisma && npx.cmd next build",
  ],
  {
    cwd: import.meta.dirname + "\\..",
    env: {
      ...process.env,
      NEXT_DIST_DIR: ".next-demo",
    },
    windowsHide: true,
    stdio: "inherit",
  }
);

process.exit(result.status ?? 1);
