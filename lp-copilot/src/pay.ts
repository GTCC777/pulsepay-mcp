// x402 payment path. Guardrails are checked against the endpoint's LIVE 402 challenge
// (authoritative price), not just the catalog copy, and always before anything is signed.
import { wrapFetchWithPayment } from '@x402/fetch';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm';
import type { LocalAccount } from 'viem/accounts';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { checkSpend, recordSpend } from './guardrail.js';

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_NETWORK = 'eip155:8453';

let paidFetch: typeof fetch | null = null;
function getPaidFetch(account: LocalAccount): typeof fetch {
  if (!paidFetch) {
    const client = new x402Client();
    client.register(BASE_NETWORK, new ExactEvmScheme(account as never));
    paidFetch = wrapFetchWithPayment(fetch, client) as typeof fetch;
  }
  return paidFetch;
}

export interface PaidResult { status: number; priceUsd: number; body: string }

export async function paidCall(account: LocalAccount, url: string, method: string): Promise<PaidResult> {
  // 1. Unpaid probe: read the authoritative 402 challenge.
  const probe = await fetch(url, { method, signal: AbortSignal.timeout(30_000) });
  if (probe.status !== 402) {
    // Free or error — nothing to pay, return as-is (never sign anything).
    return { status: probe.status, priceUsd: 0, body: await probe.text() };
  }
  const challenge = (await probe.json()) as { accepts?: Array<{ network?: string; amount?: string }> };
  const baseAccept = challenge.accepts?.find(a => a.network === BASE_NETWORK);
  if (!baseAccept?.amount) throw new Error('This endpoint does not accept Base USDC — cannot pay from this wallet.');
  const priceUsd = Number(baseAccept.amount) / 1e6;

  // 2. Guardrail — throws (agent-readable) if the call must not proceed. Nothing signed yet.
  checkSpend(url, priceUsd);

  // 3. Pay and fetch.
  const res = await getPaidFetch(account)(url, { method, signal: AbortSignal.timeout(120_000) } as RequestInit);
  const body = await res.text();
  if (res.ok) recordSpend(url, priceUsd);
  return { status: res.status, priceUsd: res.ok ? priceUsd : 0, body };
}

export async function usdcBalance(address: `0x${string}`): Promise<string> {
  const client = createPublicClient({ chain: base, transport: http() });
  const raw = await client.readContract({
    address: USDC_BASE,
    abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [address],
  });
  return formatUnits(raw as bigint, 6);
}
