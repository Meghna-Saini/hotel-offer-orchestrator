import { Hotel } from './types';

/**
 * Deduplicate by hotel name (case-insensitive). When a name appears in both
 * lists the cheaper offer wins; if only one supplier has it, that one is used.
 * On an exact price tie the first list (Supplier A) wins, which keeps the
 * result deterministic. Pure and side-effect free, so it is safe inside a workflow.
 */
export function dedupeCheapest(...lists: Hotel[][]): Hotel[] {
  const best = new Map<string, Hotel>();
  for (const list of lists) {
    for (const hotel of list) {
      const key = hotel.name.trim().toLowerCase();
      const current = best.get(key);
      if (!current || hotel.price < current.price) {
        best.set(key, hotel);
      }
    }
  }
  return [...best.values()].sort((a, b) => a.price - b.price);
}
