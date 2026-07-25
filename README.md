# @pulsenetwork/mcp

**Give your AI agent a wallet and 900+ pay-per-call intelligence APIs.**

A local MCP server that connects any MCP host (Cursor, Claude Code, Claude Desktop, …) to
[PulseNetwork](https://pulse.theaslangroupllc.com) — 74 intelligence verticals covering
finance, crypto, health, law, travel, climate, safety, and more. No accounts, no API keys:
every endpoint is paid per call in USDC on Base via the [x402](https://x402.org) protocol.

```json
{ "mcpServers": { "pulsenetwork": { "command": "npx", "args": ["-y", "@pulsenetwork/mcp", "mcp"] } } }
```

## What you get

| Tool | Cost | What it does |
|---|---|---|
| `pulse_discover` | FREE | Search the full catalog (~900 endpoints) by keyword |
| `pulse_call` | pays the listed price | Call an endpoint; payment settles automatically |
| `pulse_balance` | FREE | Wallet address + USDC balance |
| `pulse_report` | FREE | Local spend report |
| `pulse_guardrail` | FREE | Show active spend caps |

## Zero-config wallet

On first run the server generates a wallet (standard BIP-39 phrase, imports into
MetaMask/Rabby) and prints the address. Fund it with a few dollars of **USDC on Base**
and paid calls just work. The recovery phrase is stored at `~/.pulsepay/wallet.json`
(file mode 600) — **back it up**. Prefer your own key? Set `PULSEPAY_EVM_KEY` and nothing
is written to disk.

## Spend safety, enforced below the model

Guardrails run **in code, before anything is signed** — a confused or prompt-injected
agent cannot bypass them:

- **$0.50 per call / $5 per day** by default (change in `~/.pulsepay/config.json` or via
  `PULSEPAY_MAX_PER_CALL` / `PULSEPAY_MAX_PER_DAY`)
- The model has **no tool to raise caps** — only you can, by editing the file
- The wallet only pays `*.theaslangroupllc.com` (the PulseNetwork fleet) — nothing else
- Prices are checked against the endpoint's **live 402 challenge**, not a cached catalog
- Unpriceable calls are blocked, not waved through (fail-closed)

## Example prompts

> "Check if a 5-hour delayed flight from FRA to JFK qualifies for EU261 compensation."

> "Is this token safe? 0x… on Base — run a safety scan before I ape."

> "Any product recalls for 'baby teether' in the EU this year?"

> "What's my agent wallet's balance and what did it spend this week?"

Most endpoints cost $0.01–$0.25. The agent discovers for free, quotes the price, and pays
only when you ask it to.

## License

MIT © The Aslan Group LLC. Terms: https://pulse.theaslangroupllc.com/terms.html
