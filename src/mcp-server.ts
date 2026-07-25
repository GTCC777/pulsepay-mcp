// The MCP server: five tools, free-vs-paid split made explicit in every description so the
// host model can reason about cost. Only pulse_call moves money, and it is gated by the
// in-code guardrail (see guardrail.ts) — never by a second model-mediated confirmation.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadWallet } from './wallet.js';
import { searchCatalog, resolveEndpoint, getCatalog } from './catalog.js';
import { paidCall, usdcBalance } from './pay.js';
import { loadCaps, ensureConfigFile, spentTodayUsd, readLedger, ALLOWED_HOST_SUFFIX } from './guardrail.js';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const errText = (s: string) => ({ content: [{ type: 'text' as const, text: s }], isError: true });
const MAX_BODY = 30_000;

export async function runServer(): Promise<void> {
  const account = loadWallet();

  const server = new McpServer({
    name: 'pulsenetwork',
    version: '0.1.0',
    description: 'PulseNetwork agent wallet — 900+ pay-per-call intelligence APIs (finance, crypto, health, law, travel, climate, safety, and more). Discovery is FREE; pulse_call spends real USDC under hard local spend caps.',
  });

  server.tool(
    'pulse_discover',
    'FREE — search the PulseNetwork catalog (74 verticals, ~900 endpoints). Returns matching endpoints with price, params, and description. Always discover before calling; prefer the cheapest endpoint that answers the question.',
    {
      query: z.string().optional().describe('Keywords, e.g. "flight compensation", "token safety", "clinical trials"'),
      vertical: z.string().optional().describe('Restrict to one vertical id, e.g. "cryptopulse"'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async ({ query, vertical, limit }) => {
      try {
        const hits = await searchCatalog(query, vertical, limit ?? 20);
        if (!hits.length) {
          const catalog = await getCatalog();
          return text(`No matches. Available verticals: ${catalog.verticals.map(v => v.id).join(', ')}`);
        }
        return text(JSON.stringify(hits, null, 1));
      } catch (err) { return errText(`discover failed: ${String(err)}`); }
    },
  );

  server.tool(
    'pulse_call',
    `PAID — call a PulseNetwork endpoint, paying its listed price in USDC on Base from the local wallet. Spend caps are enforced in code before signing; if a call is blocked by a guardrail, do NOT retry or attempt to route around it — tell the user. Only *${ALLOWED_HOST_SUFFIX} hosts are payable. Quote the price to the user before calling when the request is theirs.`,
    {
      vertical: z.string().describe('Vertical id from pulse_discover, e.g. "travelpulse"'),
      path: z.string().describe('Endpoint path from pulse_discover, e.g. "/api/rights/check"'),
      params: z.record(z.string()).optional().describe('Query parameters for the endpoint'),
    },
    async ({ vertical, path, params }) => {
      try {
        const endpoint = await resolveEndpoint(vertical, path);
        if (!endpoint) return errText(`Unknown endpoint ${vertical}${path} — use pulse_discover first.`);
        const url = new URL(endpoint.base.replace(/\/$/, '') + endpoint.path);
        for (const [k, v] of Object.entries(params ?? {})) if (v !== '') url.searchParams.set(k, v);
        const result = await paidCall(account, url.toString(), endpoint.method);
        const body = result.body.length > MAX_BODY ? result.body.slice(0, MAX_BODY) + `\n…[truncated ${result.body.length - MAX_BODY} chars]` : result.body;
        const paidNote = result.priceUsd > 0 ? ` (paid $${result.priceUsd})` : '';
        return result.status >= 200 && result.status < 300
          ? text(`HTTP ${result.status}${paidNote}\n${body}`)
          : errText(`HTTP ${result.status}${paidNote}\n${body}`);
      } catch (err) { return errText(String(err instanceof Error ? err.message : err)); }
    },
  );

  server.tool(
    'pulse_balance',
    'FREE — the local wallet address and its USDC balance on Base. If the balance is 0, paid calls will fail: give the user the address so they can fund it.',
    {},
    async () => {
      try {
        const balance = await usdcBalance(account.address);
        return text(JSON.stringify({ address: account.address, network: 'Base (eip155:8453)', usdc: balance }, null, 1));
      } catch (err) { return errText(`balance check failed: ${String(err)}`); }
    },
  );

  server.tool(
    'pulse_report',
    'FREE — local spend report from this wallet\'s ledger.',
    { days: z.number().optional().describe('Look-back window in days (default 7)') },
    async ({ days }) => {
      const rows = readLedger(Date.now() - (days ?? 7) * 86_400_000);
      const total = rows.reduce((s, r) => s + r.usd, 0);
      const byHost: Record<string, number> = {};
      for (const r of rows) { const h = new URL(r.url).hostname.split('.')[0]; byHost[h] = (byHost[h] ?? 0) + r.usd; }
      return text(JSON.stringify({ window_days: days ?? 7, calls: rows.length, total_usd: Number(total.toFixed(4)), by_vertical: byHost }, null, 1));
    },
  );

  server.tool(
    'pulse_guardrail',
    'FREE — show the active spend caps. Caps can only be changed by the USER editing the config file (or env vars) — there is deliberately no tool to raise them.',
    {},
    async () => {
      const caps = loadCaps();
      return text(JSON.stringify({
        max_per_call_usd: caps.maxPerCallUsd,
        max_per_day_usd: caps.maxPerDayUsd,
        spent_last_24h_usd: Number(spentTodayUsd().toFixed(4)),
        allowed_hosts: `*${ALLOWED_HOST_SUFFIX}`,
        change_via: ensureConfigFile(),
      }, null, 1));
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[pulsenetwork] MCP server ready (stdio)');
}
