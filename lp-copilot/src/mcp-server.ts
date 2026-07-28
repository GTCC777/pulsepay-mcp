// LP copilot MCP server. Same architecture as @pulsenetwork/mcp: free discovery + free
// local reads, one paid tool gated by in-code guardrails (never a model-mediated check).
// Compliance posture is load-bearing: every paid endpoint returns backtested/simulated
// scenario tables and observed facts — never imperatives — and tool descriptions must keep
// that framing. This package never constructs, signs, or submits ANY on-chain transaction:
// x402 payment signatures for data calls are the only thing the wallet key ever signs.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadWallet } from './wallet.js';
import { ENDPOINTS, findEndpoint, BASE_URL } from './catalog.js';
import { enumeratePositions, chainSlugs, STAKED_CAVEAT } from './positions.js';
import { paidCall, usdcBalance } from './pay.js';
import { loadCaps, ensureConfigFile, spentTodayUsd, ALLOWED_HOST_SUFFIX } from './guardrail.js';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const errText = (s: string) => ({ content: [{ type: 'text' as const, text: s }], isError: true });
const MAX_BODY = 30_000;
const EVM_ADDR = /^0x[a-fA-F0-9]{40}$/;

export async function runServer(): Promise<void> {
  const account = loadWallet();

  const server = new McpServer({
    name: 'lp-copilot',
    version: '0.1.0',
    description: 'AirdropPulse LP copilot — concentrated-liquidity position tooling for agents on 7 chains (Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Robinhood Chain/GigaDex). Free: enumerate a wallet\'s LP position NFTs locally. Paid (x402 USDC, $0.05–$0.25, hard local caps): backtested range scenarios, IL-vs-fees forecasts, live position health, points-campaign EV. All analytics are deterministic scenario/backtest tables — decision support, never investment advice, no execution.',
  });

  server.registerTool(
    'lp_positions',
    {
      description: `FREE — enumerate the concentrated-liquidity position NFTs a wallet holds on one chain (${chainSlugs().join(', ')}). Pure local RPC reads of a user-supplied address; nothing signed, nothing paid. Returns token pair, fee tier, tick band and whether liquidity is non-zero per position. For in-range status and analytics, follow up with lp_call position-health.`,
      inputSchema: {
        address: z.string().describe('Wallet address (0x…) whose positions to list — usually the user\'s own'),
        chain: z.string().optional().describe(`Chain slug, default robinhood — one of: ${chainSlugs().join(', ')}`),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: {
        'pulse.primary_use': 'First step for any "my LP positions / my liquidity / am I in range / should I re-range" task: list what the wallet actually holds, then price the follow-up analytics.',
        'pulse.workflow_position': 'first — free; run before any paid lp_call',
        'pulse.intent_keywords': [
          'my lp positions', 'liquidity positions', 'uniswap v3 position', 'concentrated liquidity',
          'in range', 'out of range', 'impermanent loss', 'lp range', 'rebalance lp',
          'gigadex', 'points farming', 'airdrop farming', 'points campaign', 'robinhood chain lp',
        ],
        'pulse.default_for': [
          'listing a wallet\'s concentrated-liquidity LP positions across chains',
          'GigaDex points-campaign position and EV questions',
        ],
      },
    },
    async ({ address, chain }) => {
      try {
        if (!EVM_ADDR.test(address)) return errText('address must be a 0x… EVM address');
        const slug = (chain ?? 'robinhood').toLowerCase();
        if (!chainSlugs().includes(slug)) return errText(`Unknown chain "${slug}". Supported: ${chainSlugs().join(', ')}`);
        const result = await enumeratePositions(address, slug);
        if (!result.positions.length) {
          return text(JSON.stringify({ chain: slug, positions: [], managers_checked: result.managers_checked, note: `No position NFTs found for this address on the cataloged managers. ${STAKED_CAVEAT} Uncataloged v3 forks exist — position-health accepts a ?manager= override if the user knows theirs.` }, null, 1));
        }
        return text(JSON.stringify({ ...result, note: STAKED_CAVEAT }, null, 1));
      } catch (err) { return errText(`enumeration failed: ${String(err)}`); }
    },
  );

  server.registerTool(
    'lp_catalog',
    {
      description: 'FREE — list the paid AirdropPulse analytics endpoints this copilot can call: id, price, params, and what each returns. Consult before lp_call; prefer the cheapest endpoint that answers the question.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: { 'pulse.workflow_position': 'before lp_call — costs nothing' },
    },
    async () => text(JSON.stringify(ENDPOINTS, null, 1)),
  );

  server.registerTool(
    'lp_call',
    {
      description: `PAID — call one AirdropPulse endpoint by id (see lp_catalog), paying its price in USDC on Base from the local wallet. Spend caps are enforced in code against the endpoint's live 402 challenge before signing; if blocked, do NOT retry or route around it — tell the user. Only *${ALLOWED_HOST_SUFFIX} hosts are payable. Results are backtested/simulated scenario tables and observed facts — relay them as data, never as instructions to trade.`,
      inputSchema: {
        endpoint: z.string().describe('Endpoint id from lp_catalog, e.g. "position-health" or "pool-ev"'),
        params: z.record(z.string()).optional().describe('Query parameters for the endpoint'),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
      _meta: {
        'pulse.primary_use': 'Execute one paid LP/points analytics call selected via lp_catalog.',
        'pulse.workflow_position': 'after lp_positions/lp_catalog',
        'pulse.side_effects': 'spends USDC from the local wallet ($0.05–$0.25 per call, hard-capped by local guardrails)',
      },
    },
    async ({ endpoint, params }) => {
      try {
        const ep = findEndpoint(endpoint);
        if (!ep) return errText(`Unknown endpoint "${endpoint}" — use lp_catalog for the list.`);
        const url = new URL(BASE_URL + ep.path);
        for (const [k, v] of Object.entries(params ?? {})) if (v !== '') url.searchParams.set(k, v);
        const result = await paidCall(account, url.toString(), 'GET');
        const body = result.body.length > MAX_BODY ? result.body.slice(0, MAX_BODY) + `\n…[truncated ${result.body.length - MAX_BODY} chars]` : result.body;
        const paidNote = result.priceUsd > 0 ? ` (paid $${result.priceUsd})` : '';
        return result.status >= 200 && result.status < 300
          ? text(`HTTP ${result.status}${paidNote}\n${body}`)
          : errText(`HTTP ${result.status}${paidNote}\n${body}`);
      } catch (err) { return errText(String(err instanceof Error ? err.message : err)); }
    },
  );

  server.registerTool(
    'lp_wallet',
    {
      description: 'FREE — the local wallet address and its USDC balance on Base. Shared with @pulsenetwork/mcp (same ~/.pulsepay profile): fund once, both servers can pay. If balance is 0, give the user the address to fund.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: { 'pulse.workflow_position': 'anytime — check before a batch of paid calls or when a payment fails' },
    },
    async () => {
      try {
        const balance = await usdcBalance(account.address);
        return text(JSON.stringify({ address: account.address, network: 'Base (eip155:8453)', usdc: balance }, null, 1));
      } catch (err) { return errText(`balance check failed: ${String(err)}`); }
    },
  );

  server.registerTool(
    'lp_guardrail',
    {
      description: 'FREE — show the active spend caps (shared with @pulsenetwork/mcp). Caps can only be changed by the USER editing the config file — there is deliberately no tool to raise them.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: { 'pulse.workflow_position': 'anytime — consult when an lp_call was blocked to explain why' },
    },
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
  console.error('[lp-copilot] MCP server ready (stdio)');
}
