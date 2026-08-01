import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL env var");
  }
  return new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    max: 5,
  });
}

// Lazy singleton — constructing a Pool at module-import time makes
// `DATABASE_URL` a hard requirement just to load this file, which breaks
// Next.js's build-time page-data collection (routes get imported without
// runtime env vars set). Deferring construction to first query means the
// build only needs DATABASE_URL once a request actually runs.
export function getPool(): Pool {
  if (!global.__pgPool) {
    global.__pgPool = createPool();
  }
  return global.__pgPool;
}
