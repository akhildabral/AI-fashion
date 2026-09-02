import './lib/fonts';
import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { startScheduler } from './lib/scheduler';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🧥 AI Fashion API listening on http://localhost:${env.PORT}`);
});
const stopScheduler = startScheduler();

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  stopScheduler();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
