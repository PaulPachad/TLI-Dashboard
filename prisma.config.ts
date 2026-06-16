import "dotenv/config";
import { defineConfig } from "prisma/config";

function getSchemaFromCliArgs() {
  const schemaFlagIndex = process.argv.findIndex((arg) => arg === "--schema");
  if (schemaFlagIndex !== -1) {
    return process.argv[schemaFlagIndex + 1];
  }

  const inlineSchemaFlag = process.argv.find((arg) =>
    arg.startsWith("--schema=")
  );
  if (inlineSchemaFlag) {
    return inlineSchemaFlag.slice("--schema=".length);
  }

  return "prisma/schema.prisma";
}

export default defineConfig({
  schema: getSchemaFromCliArgs(),
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
