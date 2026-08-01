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

// Reuse the pool across hot reloads / route invocations in the same process.
export const pool = global.__pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}
