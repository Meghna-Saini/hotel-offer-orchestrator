import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { config } from './config';
import { logger } from './logger';

async function connectWithRetry(address: string, attempts = 30): Promise<NativeConnection> {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await NativeConnection.connect({ address });
    } catch (err) {
      logger.warn('Temporal not ready, retrying', { attempt: i, error: (err as Error).message });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`Could not connect to Temporal at ${address}`);
}

async function main() {
  const connection = await connectWithRetry(config.temporalAddress);
  const worker = await Worker.create({
    connection,
    taskQueue: config.taskQueue,
    workflowsPath: require.resolve('./workflows'),
    activities,
  });
  logger.info('Worker started', { taskQueue: config.taskQueue });
  await worker.run();
}

main().catch((err) => {
  logger.error('Worker crashed', { error: (err as Error).message });
  process.exit(1);
});
