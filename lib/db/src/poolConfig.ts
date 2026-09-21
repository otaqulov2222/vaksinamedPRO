/**
 * PostgreSQL pool options from env (P13).
 * Defaults are conservative — raise only after measuring DB capacity.
 */
export type PoolConfig = {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  allowExitOnIdle: boolean;
};

export function resolvePoolConfig(): PoolConfig {
  const max = Number(process.env.PG_POOL_MAX || process.env.DATABASE_POOL_MAX || 20);
  const idle = Number(process.env.PG_POOL_IDLE_MS || 30_000);
  const connect = Number(process.env.PG_POOL_CONNECT_TIMEOUT_MS || 10_000);
  return {
    max: Number.isFinite(max) && max > 0 ? Math.min(Math.floor(max), 200) : 20,
    idleTimeoutMillis: Number.isFinite(idle) && idle > 0 ? idle : 30_000,
    connectionTimeoutMillis: Number.isFinite(connect) && connect > 0 ? connect : 10_000,
    allowExitOnIdle: true,
  };
}
