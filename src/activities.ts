import { config } from './config';
import { logger } from './logger';
import { filterHotels, saveHotels } from './redis';
import { Hotel, SupplierHotel, SupplierName } from './types';

const SUPPLIER_PATH: Record<SupplierName, string> = {
  'Supplier A': '/supplierA/hotels',
  'Supplier B': '/supplierB/hotels',
};

/** Calls one mock supplier over HTTP and maps its payload to our Hotel shape. */
export async function fetchSupplierHotels(
  supplier: SupplierName,
  city: string,
  simulateDown = false,
): Promise<Hotel[]> {
  const url = new URL(SUPPLIER_PATH[supplier], config.supplierBaseUrl);
  url.searchParams.set('city', city);
  if (simulateDown) url.searchParams.set('fail', 'true');

  logger.info('Calling supplier', { supplier, city });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(config.supplierTimeoutMs) });
    if (!res.ok) throw new Error(`${supplier} responded with HTTP ${res.status}`);
    const data = (await res.json()) as SupplierHotel[];
    logger.info('Supplier responded', { supplier, city, count: data.length });
    return data.map((h) => ({
      name: h.name,
      price: h.price,
      supplier,
      commissionPct: h.commissionPct,
    }));
  } catch (err) {
    logger.error('Supplier call failed', { supplier, city, error: (err as Error).message });
    throw err; // let Temporal retry per the workflow's retry policy
  }
}

export async function saveHotelsToRedis(city: string, hotels: Hotel[]): Promise<void> {
  try {
    await saveHotels(city, hotels);
    logger.info('Saved hotels to Redis', { city, count: hotels.length });
  } catch (err) {
    logger.error('Failed to save to Redis', { city, error: (err as Error).message });
    throw err;
  }
}

/** Price filtering is performed inside Redis (sorted-set range query). */
export async function filterHotelsFromRedis(
  city: string,
  minPrice?: number,
  maxPrice?: number,
): Promise<Hotel[]> {
  try {
    const hotels = await filterHotels(city, minPrice, maxPrice);
    logger.info('Filtered hotels in Redis', { city, minPrice, maxPrice, count: hotels.length });
    return hotels;
  } catch (err) {
    logger.error('Failed to filter in Redis', { city, error: (err as Error).message });
    throw err;
  }
}
