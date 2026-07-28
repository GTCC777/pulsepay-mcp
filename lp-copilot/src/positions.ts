// FREE position enumeration: pure eth_call reads of the user's OWN address against public
// RPCs. Nothing is signed, nothing leaves the machine but standard RPC reads. In-range
// status, backtests and forecasts are the server's job (paid) — this tool answers only
// "what positions does this wallet hold, where".
import { CHAINS, POSITION_MANAGERS, enc, toInt24, rpc } from './chains.js';

const MAX_PER_MANAGER = 20;

/** Positions deposited into farming/points vaults are owned by the VAULT contract, so
 *  owner-enumeration cannot see them — callers should surface this caveat and fall back to
 *  by-token_id paid lookups (position-health / position-audit) for staked positions. */
export const STAKED_CAVEAT = 'Positions staked in farming or points vaults are held by the vault contract and will NOT appear here — if the user staked positions, query them by token_id via position-health or position-audit instead.';

export interface PositionSummary {
  chain: string;
  protocol: string;
  manager: string;
  token_id: string;
  token0: string;
  token1: string;
  symbol0: string;
  symbol1: string;
  fee_tier_pct: number;
  tick_lower: number;
  tick_upper: number;
  has_liquidity: boolean;
}

const word = (hex: string, i: number): string => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
const wordAddr = (hex: string, i: number): string => '0x' + word(hex, i).slice(24);

async function symbolOf(chain: string, token: string): Promise<string> {
  const r = await rpc(chain, token, '0x95d89b41');
  if (!r) return token.slice(0, 8);
  try {
    const b = Buffer.from(r.slice(2), 'hex');
    const len = Number(BigInt('0x' + r.slice(2 + 64, 2 + 128)));
    return b.subarray(64, 64 + len).toString('utf8') || token.slice(0, 8);
  } catch { return token.slice(0, 8); }
}

/** Enumerate v3-style position NFTs held by `owner` on one chain (all cataloged managers). */
export async function enumeratePositions(owner: string, chain: string): Promise<{ positions: PositionSummary[]; truncated: boolean; managers_checked: string[] }> {
  const managers = POSITION_MANAGERS[chain] ?? [];
  const positions: PositionSummary[] = [];
  let truncated = false;
  const symbols = new Map<string, string>();
  const sym = async (token: string): Promise<string> => {
    const key = token.toLowerCase();
    if (!symbols.has(key)) symbols.set(key, await symbolOf(chain, token));
    return symbols.get(key)!;
  };

  for (const { manager, protocol } of managers) {
    const balR = await rpc(chain, manager, enc('0x70a08231', owner));
    const count = balR ? Number(BigInt(balR)) : 0;
    if (!count) continue;
    if (count > MAX_PER_MANAGER) truncated = true;
    for (let i = 0; i < Math.min(count, MAX_PER_MANAGER); i++) {
      const idR = await rpc(chain, manager, enc('0x2f745c59', owner, BigInt(i).toString(16)));
      if (!idR) continue;
      const tokenId = BigInt(idR).toString();
      const posR = await rpc(chain, manager, enc('0x99fbab88', BigInt(tokenId).toString(16)));
      if (!posR || posR.length < 2 + 64 * 8) continue;
      const token0 = wordAddr(posR, 2), token1 = wordAddr(posR, 3);
      positions.push({
        chain, protocol, manager, token_id: tokenId,
        token0, token1,
        symbol0: await sym(token0), symbol1: await sym(token1),
        fee_tier_pct: Number(BigInt('0x' + word(posR, 4))) / 10000,
        tick_lower: toInt24(word(posR, 5)),
        tick_upper: toInt24(word(posR, 6)),
        has_liquidity: BigInt('0x' + word(posR, 7)) > 0n,
      });
    }
  }
  return { positions, truncated, managers_checked: managers.map(m => `${m.protocol}:${m.manager}`) };
}

export const chainSlugs = (): string[] => Object.keys(CHAINS);
