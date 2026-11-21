import { randomUUID } from 'crypto';
import express from 'express';
import { Client, Connection } from '@temporalio/client';
import { config } from './config';
import { logger } from './logger';
import { getRedis } from './redis';
import { supplierRouter } from './suppliers';
import type { HotelSearchInput, HotelSearchResult } from './workflows';

async function main() {
  const connection = await Connection.connect({ address: config.temporalAddress });
  const temporal = new Client({ connection });

  const app = express();

  // Mock supplier endpoints live inside this service.
  app.use(supplierRouter());

  const parsePrice = (v: unknown): number | undefined | 'invalid' => {
    if (v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 'invalid';
  };

  // GET /api/hotels?city=delhi[&minPrice=<min>][&maxPrice=<max>]
  app.get('/api/hotels', async (req, res) => {
    const city = typeof req.query.city === 'string' ? req.query.city.trim().toLowerCase() : '';
    if (!city) return res.status(400).json({ error: 'Query param "city" is required' });

    const minPrice = parsePrice(req.query.minPrice);
    const maxPrice = parsePrice(req.query.maxPrice);
    if (minPrice === 'invalid' || maxPrice === 'invalid') {
      return res.status(400).json({ error: 'minPrice/maxPrice must be non-negative numbers' });
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      return res.status(400).json({ error: 'minPrice cannot be greater than maxPrice' });
    }

    const simulateDown =
      req.query.simulateDown === 'A' || req.query.simulateDown === 'B'
        ? req.query.simulateDown
        : undefined;

    const input: HotelSearchInput = { city, minPrice, maxPrice, simulateDown };

    try {
      const result: HotelSearchResult = await temporal.workflow.execute('hotelSearchWorkflow', {
        taskQueue: config.taskQueue,
        workflowId: `hotel-search-${city}-${randomUUID()}`,
        args: [input],
        workflowExecutionTimeout: '30 seconds',
      });
      if (result.failedSuppliers.length > 0) {
        res.setHeader('X-Failed-Suppliers', result.failedSuppliers.join(','));
      }
      res.json(result.hotels);
    } catch (err) {
      logger.error('Workflow failed', { city, error: (err as Error).message });
      res.status(502).json({ error: 'Could not fetch hotel offers', detail: (err as Error).message });
    }
  });

  // GET /health – reports the health of both suppliers (plus Redis).
  app.get('/health', async (_req, res) => {
    const checkSupplier = async (path: string) => {
      try {
        const r = await fetch(new URL(`${path}?city=delhi`, config.supplierBaseUrl), {
          signal: AbortSignal.timeout(config.supplierTimeoutMs),
        });
        return r.ok ? 'UP' : 'DOWN';
      } catch {
        return 'DOWN';
      }
    };
    const [supplierA, supplierB, redis] = await Promise.all([
      checkSupplier('/supplierA/hotels'),
      checkSupplier('/supplierB/hotels'),
      getRedis().ping().then(() => 'UP', () => 'DOWN'),
    ]);
    const healthy = supplierA === 'UP' && supplierB === 'UP' && redis === 'UP';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'UP' : 'DEGRADED',
      suppliers: { 'Supplier A': supplierA, 'Supplier B': supplierB },
      redis,
    });
  });

  app.listen(config.port, () => logger.info('API listening', { port: config.port }));
}

main().catch((err) => {
  logger.error('API failed to start', { error: (err as Error).message });
  process.exit(1);
});
