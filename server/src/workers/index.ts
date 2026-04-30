/**
 * Worker process entry point.
 * In production, run this as a separate process: `node dist/workers/index.js`
 * In development, this is imported by index.ts when NODE_ENV !== 'production'.
 */
import './config'; // ensure env validated
import { Server as SocketServer } from 'socket.io';
import { createPickTimerWorker } from './pickTimer.worker';

// When running as standalone worker, create a minimal socket stub that logs
// (the real socket server lives in the API process)
const io = new SocketServer(); // detached — won't bind without httpServer
const worker = createPickTimerWorker(io);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err);
});

console.log('[Worker] pick-timer worker started');
