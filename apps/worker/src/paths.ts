import { existsSync } from "node:fs";

const CANDIDATES = [
  "packages/db/drizzle",
  "../packages/db/drizzle",
  "../../packages/db/drizzle",
  "./drizzle",
];

export function findMigrationsDir(): string {
  for (const candidate of CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Migrations folder not found (tried: ${CANDIDATES.join(", ")})`);
}
