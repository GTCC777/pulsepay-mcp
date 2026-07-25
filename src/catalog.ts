// Free discovery: fetches the fleet-wide catalog served by the PulseNetwork hub and
// caches it locally for an hour. Discovery never costs money.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { HOME } from './wallet.js';

const CATALOG_URL = 'https://pulse.theaslangroupllc.com/.well-known/pulse-catalog.json';
const TTL_MS = 3600_000;

export interface CatalogEndpoint {
  path: string;
  method: string;
  price_usd: number;
  description: string;
  params?: Record<string, { description?: string; required?: boolean; example?: string }>;
}
export interface CatalogVertical {
  id: string;
  base: string;
  name: string;
  description: string;
  endpoints: CatalogEndpoint[];
}
export interface Catalog { vertical_count: number; endpoint_count: number; verticals: CatalogVertical[] }

let memo: { at: number; catalog: Catalog } | null = null;

export async function getCatalog(): Promise<Catalog> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.catalog;
  const cacheFile = join(HOME, 'catalog-cache.json');
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`catalog fetch HTTP ${res.status}`);
    const catalog = (await res.json()) as Catalog;
    memo = { at: Date.now(), catalog };
    try { writeFileSync(cacheFile, JSON.stringify(catalog)); } catch { /* cache write is best-effort */ }
    return catalog;
  } catch (err) {
    if (existsSync(cacheFile)) {
      console.error(`[pulsenetwork] live catalog fetch failed (${String(err)}) — using cached copy`);
      const catalog = JSON.parse(readFileSync(cacheFile, 'utf8')) as Catalog;
      memo = { at: Date.now(), catalog };
      return catalog;
    }
    throw err;
  }
}

export interface Hit { vertical: string; base: string; path: string; method: string; price_usd: number; description: string; params?: CatalogEndpoint['params'] }

export async function searchCatalog(query?: string, vertical?: string, limit = 20): Promise<Hit[]> {
  const catalog = await getCatalog();
  const terms = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const hits: Array<Hit & { score: number }> = [];
  for (const v of catalog.verticals) {
    if (vertical && v.id !== vertical) continue;
    const vText = `${v.id} ${v.name} ${v.description}`.toLowerCase();
    for (const e of v.endpoints) {
      const eText = `${e.path} ${e.description}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (eText.includes(t)) score += 2;
        else if (vText.includes(t)) score += 1;
      }
      if (terms.length === 0 || score > 0) {
        hits.push({ vertical: v.id, base: v.base, path: e.path, method: e.method, price_usd: e.price_usd, description: e.description, params: e.params, score });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score || a.price_usd - b.price_usd);
  return hits.slice(0, limit).map(({ score: _score, ...hit }) => hit);
}

export async function resolveEndpoint(vertical: string, path: string): Promise<Hit | undefined> {
  const catalog = await getCatalog();
  const v = catalog.verticals.find(x => x.id === vertical);
  const e = v?.endpoints.find(x => x.path === path);
  if (!v || !e) return undefined;
  return { vertical: v.id, base: v.base, path: e.path, method: e.method, price_usd: e.price_usd, description: e.description, params: e.params };
}
