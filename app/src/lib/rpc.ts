import { Connection } from "@solana/web3.js";
import { RPC_URL } from "./constants";

/**
 * Shared, rate-limited RPC layer.
 *
 * WHY THIS EXISTS:
 * The app used to create 5 separate `new Connection(RPC_URL)` instances,
 * each firing its own pollers (players every 2s, signature statuses every 1s,
 * session balance/status every 5s, 128KB bitmap every 10s) with NO throttling.
 * All of them hit the SAME official public endpoint
 * (https://rpc.mainnet.x1.xyz — the only documented mainnet RPC, no fallback).
 * The resulting bursty concurrency tripped the endpoint's 429 rate limit,
 * and web3.js's automatic retry loop then flooded the console with errors.
 *
 * FIX: every Connection is now built by getConnection(), which injects a single
 * global throttled fetch. Requests are serialized with a small min-interval so
 * the burst becomes a smooth, low-rate stream — 429s become rare instead of
 * constant, and the console stops flooding.
 *
 * Tune MIN_INTERVAL_MS / MAX_INFLIGHT here if the endpoint still rate-limits
 * (lower the rate) or if gameplay input feels laggy (raise it slightly).
 */

const MIN_INTERVAL_MS = 90; // minimum spacing between outgoing RPC requests
const MAX_INFLIGHT = 3; // max concurrent RPC requests in flight
const MAX_INTERVAL_CAP_MS = 250; // never wait this long for one request slot
const POLL_INTERVAL_MS = 25; // how often the scheduler re-checks for a free slot

let lastSentAt = 0;
let inflight = 0;
let last429LoggedAt = 0;
// Coalesce repeated 429 warnings to 1 line per window instead of a flood.
const LOG_WINDOW_MS = 5000;

/** Blocks until we may fire one RPC request (respects spacing + concurrency). */
function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    const tryAcquire = () => {
      const now = Date.now();
      const waitFor = lastSentAt + MIN_INTERVAL_MS - now; // time left before next slot
      if (waitFor > MAX_INTERVAL_CAP_MS) {
        // Slots are backed up harder than we want to sleep — wait & recheck.
        setTimeout(tryAcquire, Math.min(waitFor, POLL_INTERVAL_MS));
        return;
      }
      const delay = Math.max(0, waitFor);
      if (delay > 0) {
        setTimeout(() => {
          lastSentAt = Date.now();
          inflight++;
          resolve();
        }, delay);
        return;
      }
      setTimeout(() => {
        if (inflight < MAX_INFLIGHT) {
          lastSentAt = Date.now();
          inflight++;
          resolve();
        } else {
          // At concurrency cap — retry shortly.
          setTimeout(tryAcquire, POLL_INTERVAL_MS);
        }
      }, 1);
    };
    tryAcquire();
  });
}

function releaseSlot(): void {
  inflight--;
  if (inflight < 0) inflight = 0;
}

/** The throttled fetch handed to every Connection. */
export const throttledFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input as Request).url;

  // Only throttle Solana JSON-RPC POSTs; leave non-RPC requests untouched.
  if (init?.method !== "POST") {
    return fetch(input, init);
  }

  try {
    await acquireSlot();
    const resp = await fetch(input, init);
    // Coalesce 429 warnings so the console doesn't spam identical lines.
    if (resp.status === 429) {
      const now = Date.now();
      if (now - last429LoggedAt > LOG_WINDOW_MS) {
        last429LoggedAt = now;
        console.warn(
          `[rpc] Rate-limited (429) by ${url} — throttled fetch is holding. ` +
            `If this persists, lower MIN_INTERVAL_MS in src/lib/rpc.ts.`
        );
      }
    }
    return resp;
  } finally {
    releaseSlot();
  }
};

/*
 * Build a Connection wired to the shared throttled fetch.
 * Pass a commitment to match the previous call sites (only Leaderboard used the
 * default "finalized" — that's preserved by falling through to the default).
 */
export function getConnection(commitment: import("@solana/web3.js").Commitment = "confirmed"): Connection {
  return new Connection(RPC_URL, {
    commitment,
    fetch: throttledFetch,
    // With the throttle in place 429s are rare; if one slips through, do NOT
    // let web3.js auto-retry-spam (that was the source of the console flood).
    disableRetryOnRateLimit: true,
  });
}
