import { proxyActivities, log } from '@temporalio/workflow';
import type * as activities from './activities';
import { dedupeCheapest } from './dedupe';
import { Hotel } from './types';

const { fetchSupplierHotels, saveHotelsToRedis, filterHotelsFromRedis } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '10 seconds',
  retry: { initialInterval: '500ms', backoffCoefficient: 2, maximumAttempts: 3 },
});

export interface HotelSearchInput {
  city: string;
  minPrice?: number;
  maxPrice?: number;
  /** Test hook: force a supplier to fail ("A" or "B") */
  simulateDown?: 'A' | 'B';
}

export interface HotelSearchResult {
  hotels: Hotel[];
  /** Suppliers that failed after retries; the result is built from the others. */
  failedSuppliers: string[];
}

export async function hotelSearchWorkflow(input: HotelSearchInput): Promise<HotelSearchResult> {
  const { city, minPrice, maxPrice, simulateDown } = input;

  // 1. Call both suppliers in parallel. allSettled => one supplier being down doesn't kill the search.
  const [a, b] = await Promise.allSettled([
    fetchSupplierHotels('Supplier A', city, simulateDown === 'A'),
    fetchSupplierHotels('Supplier B', city, simulateDown === 'B'),
  ]);

  const failedSuppliers: string[] = [];
  if (a.status === 'rejected') {
    failedSuppliers.push('Supplier A');
    log.error('Supplier A failed after retries', { city, reason: String(a.reason) });
  }
  if (b.status === 'rejected') {
    failedSuppliers.push('Supplier B');
    log.error('Supplier B failed after retries', { city, reason: String(b.reason) });
  }

  if (a.status === 'rejected' && b.status === 'rejected') {
    throw new Error('Both suppliers are unavailable');
  }

  // 2. Dedupe by name, keeping the cheaper offer (or the only one available).
  const deduped = dedupeCheapest(
    a.status === 'fulfilled' ? a.value : [],
    b.status === 'fulfilled' ? b.value : [],
  );

  // 3. Persist the de-duplicated list in Redis.
  await saveHotelsToRedis(city, deduped);

  // 4. Apply the price filter inside Redis (only if a range was requested).
  const hotels =
    minPrice === undefined && maxPrice === undefined
      ? deduped
      : await filterHotelsFromRedis(city, minPrice, maxPrice);

  return { hotels, failedSuppliers };
}
