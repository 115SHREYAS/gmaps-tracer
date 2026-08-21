import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@app/db";
import { findMigrationsDir } from "./paths";
import { pruneOldLogs, runSyncOnce } from "./sync";

const intervalSec = Math.max(30, Number(process.env.POLL_INTERVAL_SECONDS ?? 300));
const jitterMs = 20_000;

async function main() {
  console.log(`[worker] starting (poll every ${intervalSec}s)`);
  await migrate(db, { migrationsFolder: findMigrationsDir() });
  console.log("[worker] migrations ready");

  const tick = async () => {
    await runSyncOnce();
    if (Math.random() < 0.05) await pruneOldLogs();
  };

  setTimeout(() => {
    tick().catch((err) => console.error("[worker] tick failed", err));
  }, 5_000).unref();

  setInterval(() => {
    setTimeout(() => {
      tick().catch((err) => console.error("[worker] tick failed", err));
    }, Math.floor(Math.random() * jitterMs)).unref();
  }, intervalSec * 1000);
}

main().catch(async (err) => {
  console.error("[worker] fatal", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
