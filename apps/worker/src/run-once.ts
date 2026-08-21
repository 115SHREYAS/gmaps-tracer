import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@app/db";
import { findMigrationsDir } from "./paths";
import { runSyncOnce } from "./sync";

async function main() {
  await migrate(db, { migrationsFolder: findMigrationsDir() });
  const r = await runSyncOnce();
  console.log(r.ok ? "Sync OK" : "Sync FAILED");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
