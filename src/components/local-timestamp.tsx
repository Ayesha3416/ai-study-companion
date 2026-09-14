"use client";

import { useEffect, useState } from "react";
import { parsePgTimestamp } from "@/lib/format-date";

/**
 * Renders a Postgres timestamp in the VIEWER's real local timezone.
 *
 * Why this has to be a client component: formatting on the server uses the
 * server process's own timezone (e.g. WSL2 defaults to UTC regardless of
 * what Windows is set to; a deployed server is often UTC too), which is
 * usually NOT the same as the person actually looking at the page. Only the
 * browser reliably knows the viewer's real timezone.
 *
 * Renders a "..." placeholder until mounted to avoid a server/client
 * hydration mismatch, then fills in the correctly-localized time.
 */
export function LocalTimestamp({ value }: { value: string }) {
  const [formatted, setFormatted] = useState<string | null>(null);

  // This setState-in-effect is intentional, not a "derive state from props"
  // anti-pattern the lint rule is trying to catch: it depends on the
  // component having *mounted in the browser* (so `toLocaleString()` runs
  // with the viewer's real timezone), not on `value` changing per render.
  // There's no render-time equivalent for "wait until we're on the client."
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormatted(parsePgTimestamp(value).toLocaleString());
  }, [value]);

  return <>{formatted ?? "..."}</>;
}
