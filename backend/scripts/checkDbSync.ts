import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

type MigrationRow = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

const prisma = new PrismaClient();

function printList(label: string, items: string[]) {
  if (!items.length) return;
  console.log(`${label} (${items.length}):`);
  for (const item of items) {
    console.log(`  - ${item}`);
  }
}

async function getLocalMigrations(): Promise<string[]> {
  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const entries: Dirent[] = await readdir(migrationsDir, {
    withFileTypes: true,
  });

  return entries
    .filter(
      (entry: Dirent) =>
        entry.isDirectory() &&
        entry.name !== "migration_lock.toml" &&
        !entry.name.startsWith(".")
    )
    .map((entry: Dirent) => entry.name)
    .sort();
}

async function getAppliedMigrations() {
  const rows = await prisma.$queryRaw<MigrationRow[]>`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    ORDER BY started_at ASC
  `;

  const applied = rows
    .filter((row) => row.finished_at && !row.rolled_back_at)
    .map((row) => row.migration_name);

  const rolledBack = rows
    .filter((row) => row.rolled_back_at)
    .map((row) => row.migration_name);

  return {
    applied: Array.from(new Set(applied)).sort(),
    rolledBack: Array.from(new Set(rolledBack)).sort(),
  };
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[DB SYNC] DATABASE_URL is not set.");
    process.exit(2);
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error: any) {
    console.error(
      `[DB SYNC] Could not connect to database: ${error?.message || error}`
    );
    process.exit(2);
  }

  const local = await getLocalMigrations();
  if (!local.length) {
    console.warn("[DB SYNC] No local migrations found in prisma/migrations.");
  }

  let dbMigrations: Awaited<ReturnType<typeof getAppliedMigrations>>;
  try {
    dbMigrations = await getAppliedMigrations();
  } catch (error: any) {
    console.error(
      `[DB SYNC] Could not read _prisma_migrations table: ${error?.message || error}`
    );
    process.exit(2);
    return;
  }

  const localSet = new Set(local);
  const appliedSet = new Set(dbMigrations.applied);

  const pendingInDb = local.filter((name: string) => !appliedSet.has(name));
  const extraInDb = dbMigrations.applied.filter((name) => !localSet.has(name));

  console.log(`[DB SYNC] Local migrations: ${local.length}`);
  console.log(`[DB SYNC] Applied migrations in DB: ${dbMigrations.applied.length}`);

  printList("[DB SYNC] Pending in DB", pendingInDb);
  printList("[DB SYNC] Extra in DB (missing locally)", extraInDb);
  printList("[DB SYNC] Rolled back migrations", dbMigrations.rolledBack);

  if (!pendingInDb.length && !extraInDb.length && !dbMigrations.rolledBack.length) {
    console.log("[DB SYNC] OK: database is in sync with local migrations.");
    process.exit(0);
  }

  console.error("[DB SYNC] OUT OF SYNC: database and local migrations differ.");
  process.exit(1);
}

main()
  .catch((error) => {
    console.error(`[DB SYNC] Unexpected failure: ${error?.message || error}`);
    process.exit(2);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
