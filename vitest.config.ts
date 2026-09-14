import { defineConfig } from "vitest/config";
import path from "path";

// Step 34 (PRD §73). Unit tests only run against pure, side-effect-free
// logic (see src/lib/**/*.test.ts) — nothing here talks to Supabase, Groq,
// or Langfuse, so no env vars or network access are needed for `npm test`
// to pass. The one exception is tests/integration/rls-isolation.test.ts,
// which needs real Supabase credentials and is self-skipping when they're
// absent — see that file's own header comment.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
