import type { IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { BridgeConfig } from "./config.js";

/**
 * Who may talk to the hub.
 *
 * The hub can launch agents that edit files, so an unauthenticated request is
 * as good as a shell. Two protections apply always, and a token applies when
 * one is configured:
 *
 * 1. Browser pages from other sites. A page on any website can fire requests
 *    at 127.0.0.1. State-changing requests must carry `Content-Type:
 *    application/json` (a cross-site page can't send that without a CORS
 *    preflight the hub never answers) and, when the browser sends an Origin,
 *    it must be the hub itself.
 * 2. DNS rebinding. A hostile name that resolves to 127.0.0.1 still sends its
 *    own Host header, so the Host must be one of the hub's own addresses.
 * 3. Tokens. A hub has two, generated on first use (see `machineAuth`):
 *    your own `token` opens the HTTP API and MCP — as a Bearer header, an
 *    `x-ekip-token` header, or the `ekip_token` cookie the web app gets after
 *    signing in — while the `agentToken` spawned runs receive is accepted on
 *    `/mcp` only. So a run that is talked into something by a file it reads
 *    can still only use the bridge tools, within the limits the hub puts on
 *    its own task; it cannot POST /api/delegate to start work elsewhere.
 *    `openAccess: true` turns tokens off entirely. A hub listening beyond
 *    loopback refuses to start without a token.
 */

export function hubToken(config: BridgeConfig): string | undefined {
  if (config.openAccess) return undefined;
  const t = process.env.EKIP_TOKEN ?? config.token;
  return t && t.trim() ? t.trim() : undefined;
}

/** The credential spawned runs get: MCP only. */
export function agentToken(config: BridgeConfig): string | undefined {
  if (config.openAccess) return undefined;
  const t = process.env.EKIP_AGENT_TOKEN ?? config.agentToken;
  return t && t.trim() ? t.trim() : undefined;
}

export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

/** Throw when the configuration would expose the hub without a token. */
export function assertSafeBinding(config: BridgeConfig): void {
  if (!isLoopback(config.host) && !hubToken(config)) {
    throw new Error(
      `ekip refuses to listen on ${config.host} without a token — anyone who can reach it could run agents on this machine. ` +
        `Set EKIP_TOKEN, or "token" in ekip.config.json, or listen on 127.0.0.1.`,
    );
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function presentedToken(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const header = req.headers["x-ekip-token"];
  if (typeof header === "string" && header) return header.trim();
  const cookie = req.headers.cookie;
  if (typeof cookie === "string") {
    const m = /(?:^|;\s*)ekip_token=([^;]+)/.exec(cookie);
    if (m) {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        // Any page on 127.0.0.1 can set a cookie for this host; a malformed one is just "no token".
        return undefined;
      }
    }
  }
  return undefined;
}

export function tokenMatches(config: BridgeConfig, candidate: string | undefined): boolean {
  const token = hubToken(config);
  return !token || (candidate !== undefined && safeEqual(candidate, token));
}

/** Does this request carry a credential good for `/mcp` (yours, or an agent's)? */
export function mcpTokenMatches(config: BridgeConfig, candidate: string | undefined): boolean {
  if (tokenMatches(config, candidate)) return true;
  const agent = agentToken(config);
  return Boolean(agent && candidate !== undefined && safeEqual(candidate, agent));
}

export interface AccessDenied {
  status: number;
  error: string;
}

/** Decide whether a request may proceed. `undefined` means yes. */
export function checkAccess(config: BridgeConfig, req: IncomingMessage, path: string): AccessDenied | undefined {
  const method = (req.method ?? "GET").toUpperCase();
  const token = hubToken(config);

  // DNS rebinding: the Host must be one of ours (a wildcard bind relies on the token).
  const host = String(req.headers.host ?? "").toLowerCase();
  const ours = new Set([`127.0.0.1:${config.port}`, `localhost:${config.port}`, `[::1]:${config.port}`, `${config.host}:${config.port}`]);
  const wildcard = config.host === "0.0.0.0" || config.host === "::";
  if (host && !ours.has(host) && !wildcard) {
    return { status: 403, error: `unexpected Host header ${host}` };
  }

  const api = path === "/mcp" || path.startsWith("/api/");
  const changes = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

  if (api && changes) {
    const origin = req.headers.origin;
    if (typeof origin === "string" && origin && origin !== "null") {
      let originHost = "";
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {
        return { status: 403, error: "bad Origin header" };
      }
      if (originHost !== host) return { status: 403, error: `requests from ${origin} are not allowed` };
    } else if (origin === "null") {
      return { status: 403, error: "requests from opaque origins are not allowed" };
    }
    const type = String(req.headers["content-type"] ?? "");
    if (path !== "/mcp" || method === "POST") {
      if (!/^application\/json\b/i.test(type)) return { status: 415, error: "send Content-Type: application/json" };
    }
  }

  if (token && api && path !== "/api/login") {
    const presented = presentedToken(req);
    const ok = path === "/mcp" ? mcpTokenMatches(config, presented) : tokenMatches(config, presented);
    if (!ok) {
      return {
        status: 401,
        error:
          path === "/mcp"
            ? "this hub needs a token — send Authorization: Bearer <token> (agents use the hub's agent token)"
            : "this hub needs a token — sign in with it, or send Authorization: Bearer <token>",
      };
    }
  }
  return undefined;
}
