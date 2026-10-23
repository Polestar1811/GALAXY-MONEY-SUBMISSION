import type { FinancialsSnapshot } from "@/types/market";
import { factFingerprint } from "@/lib/personalization/engine";

/**
 * 事实快照存储：同一快照可被多次研究（如画像 A / B 对比）复用，
 * 保证不同画像使用的是完全相同的一份市场事实。仅保存在服务端内存中，不含任何画像信息。
 */
const TTL_MS = 30 * 60_000;
const MAX = 30;

interface Entry {
  id: string;
  symbol: string;
  fin: FinancialsSnapshot;
  createdAt: number;
}

const store = new Map<string, Entry>();

export function putSnapshot(symbol: string, fin: FinancialsSnapshot): Entry {
  const createdAt = Date.now();
  const id = `${symbol}-${factFingerprint(fin.facts)}-${createdAt.toString(36)}`;
  const entry = { id, symbol, fin, createdAt };
  store.set(id, entry);
  while (store.size > MAX) store.delete(store.keys().next().value as string);
  return entry;
}

export function getSnapshot(id: string | null | undefined, symbol: string): Entry | null {
  if (!id) return null;
  const e = store.get(id);
  if (!e || e.symbol !== symbol || Date.now() - e.createdAt > TTL_MS) return null;
  return e;
}

export function clearSnapshots() {
  store.clear();
}
