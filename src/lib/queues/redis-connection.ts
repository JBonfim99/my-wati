import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  queueRedisConnection?: IORedis;
};

/**
 * Conexão Redis única para filas BullMQ (evita múltiplos sockets por processo).
 */
export function getQueueRedisConnection(): IORedis {
  if (globalForRedis.queueRedisConnection) {
    return globalForRedis.queueRedisConnection;
  }
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  globalForRedis.queueRedisConnection = new IORedis(url, {
    maxRetriesPerRequest: null,
  });
  return globalForRedis.queueRedisConnection;
}
