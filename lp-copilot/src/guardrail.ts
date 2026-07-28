// Spend guardrails enforced BELOW the model: checks run in code before any payment is
// signed, so a prompt-injected or hallucinating agent cannot bypass them by phrasing a
// tool call differently. Caps are read from ~/.pulsepay/config.json (or env) — the model
// has NO tool that raises them; a human edits the file. Fail-closed: an unpriceable call
// is blocked, not waved through.
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HOME } from './wallet.js';

// The profile dir must exist regardless of how the wallet was loaded (the env-key path
// skips wallet-file creation but the config/ledger still live here).
mkdirSync(HOME, { recursive: true, mode: 0o700 });

export interface Caps { maxPerCallUsd: number; maxPerDayUsd: number }

const DEFAULTS: Caps = { maxPerCallUsd: 0.5, maxPerDayUsd: 5 };
// The wallet only ever pays PulseNetwork origins. Hard-coded on purpose — this package is
// a fleet client, not a general x402 wallet, and the allowlist is part of its safety story.
export const ALLOWED_HOST_SUFFIX = '.theaslangroupllc.com';

const configFile = () => join(HOME, 'config.json');
const ledgerFile = () => join(HOME, 'spend-ledger.jsonl');

export function loadCaps(): Caps {
  let caps = { ...DEFAULTS };
  try {
    if (existsSync(configFile())) caps = { ...caps, ...JSON.parse(readFileSync(configFile(), 'utf8')) };
  } catch (err) {
    console.error(`[pulsenetwork] config.json unreadable (${String(err)}) — using defaults`);
  }
  if (process.env.PULSEPAY_MAX_PER_CALL) caps.maxPerCallUsd = Number(process.env.PULSEPAY_MAX_PER_CALL);
  if (process.env.PULSEPAY_MAX_PER_DAY) caps.maxPerDayUsd = Number(process.env.PULSEPAY_MAX_PER_DAY);
  return caps;
}

export function ensureConfigFile(): string {
  if (!existsSync(configFile())) writeFileSync(configFile(), JSON.stringify(DEFAULTS, null, 2));
  return configFile();
}

interface LedgerRow { t: number; url: string; usd: number }

export function spentTodayUsd(): number {
  if (!existsSync(ledgerFile())) return 0;
  const cutoff = Date.now() - 24 * 3600 * 1000;
  let total = 0;
  for (const line of readFileSync(ledgerFile(), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as LedgerRow;
      if (row.t >= cutoff) total += row.usd;
    } catch { /* ignore torn line */ }
  }
  return total;
}

export function recordSpend(url: string, usd: number): void {
  appendFileSync(ledgerFile(), JSON.stringify({ t: Date.now(), url, usd } satisfies LedgerRow) + '\n');
}

export function readLedger(sinceMs: number): LedgerRow[] {
  if (!existsSync(ledgerFile())) return [];
  const rows: LedgerRow[] = [];
  for (const line of readFileSync(ledgerFile(), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const row = JSON.parse(line) as LedgerRow; if (row.t >= sinceMs) rows.push(row); } catch { /* ignore */ }
  }
  return rows;
}

/** Throws with an agent-readable message when the call must not proceed. */
export function checkSpend(url: string, priceUsd: number): void {
  const host = new URL(url).hostname;
  if (!host.endsWith(ALLOWED_HOST_SUFFIX)) {
    throw new Error(`Blocked: ${host} is not a PulseNetwork host. This wallet only pays *${ALLOWED_HOST_SUFFIX} endpoints.`);
  }
  if (!Number.isFinite(priceUsd) || priceUsd < 0) {
    throw new Error(`Blocked: could not determine a price for this call (fail-closed). Do not retry; report the endpoint.`);
  }
  const caps = loadCaps();
  if (priceUsd > caps.maxPerCallUsd) {
    throw new Error(
      `Blocked by guardrail: this call costs $${priceUsd} but the per-call cap is $${caps.maxPerCallUsd}. ` +
      `Do NOT retry or route around this. The user can raise the cap by editing ${configFile()}.`,
    );
  }
  const today = spentTodayUsd();
  if (today + priceUsd > caps.maxPerDayUsd) {
    throw new Error(
      `Blocked by guardrail: $${today.toFixed(2)} already spent in the last 24h; this $${priceUsd} call would exceed the daily cap of $${caps.maxPerDayUsd}. ` +
      `Do NOT retry. The user can raise the cap by editing ${configFile()}.`,
    );
  }
}
