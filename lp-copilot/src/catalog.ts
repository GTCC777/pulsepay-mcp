// Static catalog of the AirdropPulse LP/points endpoints this copilot fronts. Prices here
// are advisory for planning — the guardrail always re-checks the endpoint's LIVE 402
// challenge before anything is signed (see pay.ts), so a stale price can only block, never
// overspend. Keep in sync with airdroppulse api/ when endpoints change.
export const BASE_URL = 'https://airdroppulse.theaslangroupllc.com';

export interface LpEndpoint {
  id: string;
  path: string;
  price_usd: number;
  params: Record<string, string>;
  description: string;
}

export const ENDPOINTS: LpEndpoint[] = [
  {
    id: 'position-health', path: '/api/lp/position-health', price_usd: 0.05,
    params: { token_id: 'position NFT id (required)', chain: 'chain slug, default robinhood', manager: 'optional 0x… NonfungiblePositionManager for uncataloged v3 forks', pool: 'optional pool 0x… override' },
    description: 'Live snapshot of one position: in-range or not, % through band, current tick vs bounds, liquidity state. The "is my position still working" check.',
  },
  {
    id: 'range-model', path: '/api/lp/range-model', price_usd: 0.25,
    params: { pool: 'pool address 0x… (required)', chain: 'chain slug, default robinhood', horizon_days: 'forecast horizon, default 7', lookback_hours: 'history window, default 168' },
    description: 'Backtested range-scenario table from the pool\'s own tick history: for each candidate width, time-in-range and fee capture over the lookback. Scenario data, not instructions.',
  },
  {
    id: 'il-forecast', path: '/api/lp/il-forecast', price_usd: 0.15,
    params: { pool: 'pool address 0x… (required)', chain: 'chain slug, default robinhood', lower_pct: 'band lower bound vs current price, e.g. 10', upper_pct: 'band upper bound, e.g. 10', horizon_days: 'default 7' },
    description: 'Impermanent-loss vs fee-income forecast for a hypothetical range, from realized volatility. Backtested/simulated figures.',
  },
  {
    id: 'rebalance-check', path: '/api/lp/rebalance-check', price_usd: 0.10,
    params: { token_id: 'GigaDex position NFT id (required)', horizon_days: 'default 7' },
    description: 'GigaDex-only: costs vs modeled benefit of re-ranging a specific position now, including GIGA-Protect churn considerations. Scenario comparison, not a directive.',
  },
  {
    id: 'pool-ev', path: '/api/points/pool-ev', price_usd: 0.15,
    params: { min_tvl_usd: 'filter tiny pools, default 1000' },
    description: 'GigaDex points campaign: points-per-$1k-TVL ranking across pools from live campaign + TVL data — the capital-efficiency metric for points farming.',
  },
  {
    id: 'campaign-status', path: '/api/points/campaign-status', price_usd: 0.05,
    params: { giga_per_point: 'optional implied conversion override', fdv_usd: 'optional FDV assumption for $-framing' },
    description: 'GigaDex campaign clock: emission rate, points emitted so far, farmer count, days left, optional implied-value framing under stated assumptions.',
  },
  {
    id: 'position-audit', path: '/api/points/position-audit', price_usd: 0.10,
    params: { token_id: 'position NFT id', account: 'or the account address to audit' },
    description: 'Points earned by a position/account, share of emissions, and projection at current share. Observed + projected figures.',
  },
  {
    id: 'entry-guide', path: '/api/points/entry-guide', price_usd: 0.10,
    params: { min_tvl_usd: 'filter, default 1000' },
    description: 'GigaDex campaign mechanics from first-party docs + chain: contracts, pools, fee tiers, GIGA-Protect rules — what an agent needs to participate safely.',
  },
];

export const findEndpoint = (id: string): LpEndpoint | undefined =>
  ENDPOINTS.find(e => e.id === id || e.path === id);
