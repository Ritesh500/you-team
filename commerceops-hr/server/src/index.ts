import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './lib/prisma.js';

async function main(): Promise<void> {
  try {
    await connectDatabase();
    console.log('[server] database connection established');
  } catch (error) {
    console.error(
      '\n[server] could not connect to PostgreSQL.\n' +
        '         Start it with `npm run db:start` (from the project root), or point\n' +
        '         DATABASE_URL in server/.env at your own PostgreSQL instance.\n',
    );
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`[server] You Team API listening on http://localhost:${env.PORT}`);
    console.log(`[server] health check:  http://localhost:${env.PORT}/health`);
    console.log(`[server] api index:     http://localhost:${env.PORT}/api/v1`);
    console.log(`[server] allowed origin: ${env.WEB_ORIGIN}`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n[server] ${signal} received, closing down…`);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });

    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main();
