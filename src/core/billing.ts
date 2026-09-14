import { execFile } from "node:child_process";

export type ClaudeBilling = "subscription" | "api" | "unknown";

let cached: { at: number; value: ClaudeBilling; plan?: string } | undefined;

/**
 * How the local `claude` CLI is logged in, which decides what the cost it
 * reports means. Claude Code prices every run at API list prices; on a
 * claude.ai subscription that number is a reference, and the real limit is
 * the plan's usage allowance. Cached for an hour.
 */
export function claudeBilling(): Promise<{ value: ClaudeBilling; plan?: string }> {
  if (cached && Date.now() - cached.at < 3_600_000) return Promise.resolve(cached);
  return new Promise((resolve) => {
    execFile("claude", ["auth", "status"], { timeout: 15_000 }, (err, stdout) => {
      let value: ClaudeBilling = "unknown";
      let plan: string | undefined;
      if (!err) {
        try {
          const status = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string };
          if (status.loggedIn && status.authMethod === "claude.ai") value = "subscription";
          else if (status.loggedIn && status.authMethod) value = "api";
          plan = typeof status.subscriptionType === "string" ? status.subscriptionType : undefined;
        } catch {
          // not JSON — older CLI; leave unknown
        }
      }
      cached = { at: Date.now(), value, plan };
      resolve(cached);
    });
  });
}
