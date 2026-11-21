export const config = {
  port: Number(process.env.PORT ?? 3000),
  temporalAddress: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  taskQueue: process.env.TASK_QUEUE ?? 'hotel-offers',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // Base URL where the mock supplier endpoints are served (the API service itself).
  supplierBaseUrl: process.env.SUPPLIER_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  supplierTimeoutMs: Number(process.env.SUPPLIER_TIMEOUT_MS ?? 3000),
  // How long a cached, de-duplicated city list stays in Redis (seconds).
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 3600),
};
