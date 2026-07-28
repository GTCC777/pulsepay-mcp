# @pulsenetwork/lp-copilot-mcp

**LP copilot for AI agents.** List your concentrated-liquidity positions for free, then buy
deterministic analytics per call — backtested range scenarios, IL-vs-fees forecasts, live
position health, points-campaign EV — over [x402](https://x402.org) USDC micropayments.
No API key, no subscription, no signup.

Works anywhere MCP does: Claude Desktop / Claude Code, Cursor, and any MCP-capable agent.

## Quick start

```json
{
  "mcpServers": {
    "lp-copilot": {
      "command": "npx",
      "args": ["-y", "@pulsenetwork/lp-copilot-mcp"]
    }
  }
}
```

First run generates a local wallet at `~/.pulsepay/wallet.json` (yours — back up the phrase).
Fund it with a few dollars of USDC on Base to enable paid calls. Already using
`@pulsenetwork/mcp`? Same profile, same wallet — nothing new to fund.

## Tools

| Tool | Cost | What it does |
|------|------|--------------|
| `lp_positions` | free | Enumerate a wallet's v3-style position NFTs on Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, or Robinhood Chain (GigaDex) — local RPC reads only |
| `lp_catalog` | free | List the paid endpoints, prices, params |
| `lp_call` | $0.05–$0.25 | One analytics call: `position-health`, `range-model`, `il-forecast`, `rebalance-check`, `pool-ev`, `campaign-status`, `position-audit`, `entry-guide` |
| `lp_wallet` | free | Wallet address + USDC balance |
| `lp_guardrail` | free | Show active spend caps |

## Safety model

- **Non-custodial, no execution.** This package never constructs, signs, or submits any
  on-chain transaction. The wallet key signs x402 payment authorizations for data calls —
  nothing else. Your positions stay yours; your agent only reads them.
- **Spend caps enforced in code**, below the model: per-call and per-day caps checked
  against each endpoint's live 402 challenge before anything is signed. Defaults:
  $0.50/call, $5/day. Raise them only by editing `~/.pulsepay/config.json` — there is
  deliberately no tool that can.
- **Allowlist:** the wallet only ever pays `*.theaslangroupllc.com` endpoints.

## What the analytics are (and aren't)

Every paid endpoint returns deterministic, backtested or simulated scenario tables and
observed on-chain facts — e.g. "over the last 168h, a ±10% range was in-range 74% of the
time and captured N in fees at M% realized volatility." Decision support, not investment
advice. No recommendations, no execution, no custody, not SEC-registered. Crypto LP
positions can lose value; past ranges do not predict future prices.

MIT © The Aslan Group LLC · [airdroppulse.theaslangroupllc.com](https://airdroppulse.theaslangroupllc.com)
