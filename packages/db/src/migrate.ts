import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle" });
}

// CLI entry: pnpm --filter @app/db migrate
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("migrate.ts")) {
  runMigrations()
    .then(() => {
      console.log("Migrations complete.");
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
