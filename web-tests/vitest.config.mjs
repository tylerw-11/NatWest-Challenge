import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const web = fileURLToPath(new URL("../web", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": web } },
  test: { include: ["*.test.ts"], environment: "node" },
});
