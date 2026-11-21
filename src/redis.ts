import Redis from 'ioredis';
import { config } from './config';
import { Hotel } from './types';

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false });
  }
  return client;
}

/*
 * Redis layout (per city):
 *   hotels:<city>:data    HASH        field = hotel name (lower-cased), value = JSON Hotel
 *   hotels:<city>:prices  SORTED SET  member = hotel name (lower-cased), score = price
 *
 * The sorted set lets Redis do the price-range filtering itself (ZRANGEBYSCORE).
 */
const dataKey = (city: string) => `hotels:${city.toLowerCase()}:data`;
const priceKey = (city: string) => `hotels:${city.toLowerCase()}:prices`;

export async function saveHotels(city: string, hotels: Hotel[]): Promise<void> {
  const redis = getRedis();
  const multi = redis.multi();
  multi.del(dataKey(city), priceKey(city));
  for (const h of hotels) {
    const member = h.name.toLowerCase();
    multi.hset(dataKey(city), member, JSON.stringify(h));
    multi.zadd(priceKey(city), h.price, member);
  }
  if (hotels.length > 0) {
    multi.expire(dataKey(city), config.cacheTtlSeconds);
    multi.expire(priceKey(city), config.cacheTtlSeconds);
  }
  await multi.exec();
}

export async function filterHotels(city: string, min?: number, max?: number): Promise<Hotel[]> {
  const redis = getRedis();
  const lo = min === undefined ? '-inf' : String(min);
  const hi = max === undefined ? '+inf' : String(max);
  const members = await redis.zrangebyscore(priceKey(city), lo, hi);
  if (members.length === 0) return [];
  const raw = await redis.hmget(dataKey(city), ...members);
  return raw.filter((r): r is string => r !== null).map((r) => JSON.parse(r) as Hotel);
}
