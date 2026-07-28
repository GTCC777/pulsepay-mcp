// Chain registry + raw eth_call reads for free position enumeration. Kept in sync with
// airdroppulse lib/chains.ts (the server is authoritative — this copy only powers the
// FREE local lp_positions tool; all analytics math happens server-side in paid calls).
export interface ChainInfo { id: number; name: string; rpc: string }

export const CHAINS: Record<string, ChainInfo> = {
  ethereum: { id: 1, name: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com' },
  optimism: { id: 10, name: 'Optimism', rpc: 'https://optimism-rpc.publicnode.com' },
  bsc: { id: 56, name: 'BNB Chain', rpc: 'https://bsc-rpc.publicnode.com' },
  polygon: { id: 137, name: 'Polygon', rpc: 'https://polygon-bor-rpc.publicnode.com' },
  robinhood: { id: 4663, name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com/' },
  base: { id: 8453, name: 'Base', rpc: 'https://base-rpc.publicnode.com' },
  arbitrum: { id: 42161, name: 'Arbitrum One', rpc: 'https://arbitrum-one-rpc.publicnode.com' },
};
export const SUPPORTED_CHAINS = Object.keys(CHAINS);

const UNI_V3_NPM = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
export const POSITION_MANAGERS: Record<string, { manager: string; protocol: string }[]> = {
  ethereum: [{ manager: UNI_V3_NPM, protocol: 'uniswap-v3' }],
  optimism: [{ manager: UNI_V3_NPM, protocol: 'uniswap-v3' }],
  bsc: [
    { manager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364', protocol: 'pancakeswap-v3' },
    { manager: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613', protocol: 'uniswap-v3' },
  ],
  polygon: [{ manager: UNI_V3_NPM, protocol: 'uniswap-v3' }],
  base: [{ manager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1', protocol: 'uniswap-v3' }],
  arbitrum: [{ manager: UNI_V3_NPM, protocol: 'uniswap-v3' }],
  robinhood: [{ manager: '0xA79F5775b0B49E51202c48DDF03F380FaA96f641', protocol: 'gigadex' }],
};

export const enc = (sel: string, ...words: string[]): string =>
  sel + words.map(w => w.replace(/^0x/, '').padStart(64, '0')).join('');

export const toInt24 = (hexWord: string): number => {
  const v = BigInt('0x' + hexWord);
  return Number(v > 2n ** 255n ? v - 2n ** 256n : v);
};

export async function rpc(chain: string, to: string, data: string): Promise<string | null> {
  const c = CHAINS[chain];
  if (!c) return null;
  try {
    const r = await fetch(c.rpc, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await r.json()) as { result?: string };
    return j.result && j.result !== '0x' ? j.result : null;
  } catch { return null; }
}
