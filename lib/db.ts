// Drizzle ORM: SQLite file (cgiverify.db) by default; Postgres when DATABASE_URL is set.
// Both dialects share the same table/column names; the pg schema module mirrors the sqlite one.
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import * as sqliteSchema from "./schema.sqlite";
import { normalizeSnapshot, type SnapshotData } from "./types";
import type { SkuResult } from "./method";
import { recomputeAll, verdictOf } from "./summary";

type Db = ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>;
export const MAX_SNAPSHOTS = 25;

const DDL_SQLITE = [
  `CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, captured_at TEXT NOT NULL, source_url TEXT NOT NULL, data TEXT NOT NULL, results TEXT NOT NULL, verdict TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS scenarios (id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, params TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS snapshots_owner ON snapshots(owner_id, captured_at)`,
  `CREATE INDEX IF NOT EXISTS events_owner ON events(owner_id, kind, at)`,
];
const DDL_PG = DDL_SQLITE.map((s) => s.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY").replace("at INTEGER", "at BIGINT"));

const g = globalThis as unknown as { __cgiDb?: Promise<{ db: Db; t: typeof sqliteSchema }> };

async function init(): Promise<{ db: Db; t: typeof sqliteSchema }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pgSchema = await import("./schema.pg");
    const pool = new Pool({ connectionString: url });
    for (const s of DDL_PG) await pool.query(s);
    return { db: drizzle(pool, { schema: pgSchema }) as unknown as Db, t: pgSchema as unknown as typeof sqliteSchema };
  }
  const Database = (await import("better-sqlite3")).default;
  const file = new Database(process.env.SQLITE_PATH ?? "cgiverify.db");
  file.pragma("journal_mode = WAL");
  for (const s of DDL_SQLITE) file.exec(s);
  return { db: drizzleSqlite(file, { schema: sqliteSchema }), t: sqliteSchema };
}
const conn = () => (g.__cgiDb ??= init());

export type SnapshotRow = { id: string; ownerId: string; capturedAt: string; sourceUrl: string; data: SnapshotData; results: SkuResult[]; verdict: string };
// Results/verdict are a pure function of the stored inputs, so they are recomputed with the CURRENT engine on every read
// (page-scrape-era rows are upgraded by normalizeSnapshot first); the stored columns are kept only for the log index.
const parse = (r: { id: string; ownerId: string; capturedAt: string; sourceUrl: string; data: string; results: string; verdict: string }): SnapshotRow =>
  {
  const data = normalizeSnapshot(JSON.parse(r.data)); const results = recomputeAll(data);
  return { ...r, data, results, verdict: verdictOf(results) };
};

export async function listSnapshots(owner: string): Promise<SnapshotRow[]> {
  const { db, t } = await conn();
  const rows = await db.select().from(t.snapshots).where(eq(t.snapshots.ownerId, owner)).orderBy(desc(t.snapshots.capturedAt));
  return rows.map(parse);
}
/** Owner-scoped: another owner's id returns null (surfaced as 404). */
export async function getSnapshot(owner: string, id: string): Promise<SnapshotRow | null> {
  const { db, t } = await conn();
  const rows = await db.select().from(t.snapshots).where(and(eq(t.snapshots.id, id), eq(t.snapshots.ownerId, owner)));
  return rows[0] ? parse(rows[0]) : null;
}
export async function saveSnapshot(owner: string, data: SnapshotData, results: SkuResult[]): Promise<{ row: SnapshotRow; pruned: number }> {
  const { db, t } = await conn();
  const id = crypto.randomUUID();
  const verdict = verdictOf(results);
  await db.insert(t.snapshots).values({ id, ownerId: owner, capturedAt: data.capturedAt, sourceUrl: data.source, data: JSON.stringify(data), results: JSON.stringify(results), verdict });
  const all = await db.select({ id: t.snapshots.id }).from(t.snapshots).where(eq(t.snapshots.ownerId, owner)).orderBy(desc(t.snapshots.capturedAt));
  const old = all.slice(MAX_SNAPSHOTS);
  for (const o of old) {
    await db.delete(t.scenarios).where(eq(t.scenarios.snapshotId, o.id));
    await db.delete(t.snapshots).where(eq(t.snapshots.id, o.id));
  }
  return { row: { id, ownerId: owner, capturedAt: data.capturedAt, sourceUrl: data.source, data, results, verdict }, pruned: old.length };
}
export async function deleteSnapshot(owner: string, id: string): Promise<boolean> {
  const s = await getSnapshot(owner, id);
  if (!s) return false;
  const { db, t } = await conn();
  await db.delete(t.scenarios).where(eq(t.scenarios.snapshotId, id));
  await db.delete(t.snapshots).where(eq(t.snapshots.id, id));
  return true;
}

export type ScenarioRow = { id: string; snapshotId: string; name: string; params: unknown; result: unknown; createdAt: string };
export async function listScenarios(owner: string, snapshotId: string): Promise<ScenarioRow[]> {
  const { db, t } = await conn();
  const rows = await db.select().from(t.scenarios).where(and(eq(t.scenarios.ownerId, owner), eq(t.scenarios.snapshotId, snapshotId))).orderBy(desc(t.scenarios.createdAt));
  return rows.map((r) => ({ id: r.id, snapshotId: r.snapshotId, name: r.name, params: JSON.parse(r.params), result: JSON.parse(r.result), createdAt: r.createdAt }));
}
export async function saveScenario(owner: string, snapshotId: string, name: string, params: unknown, result: unknown): Promise<ScenarioRow> {
  const { db, t } = await conn();
  const row = { id: crypto.randomUUID(), snapshotId, ownerId: owner, name, params: JSON.stringify(params), result: JSON.stringify(result), createdAt: new Date().toISOString() };
  await db.insert(t.scenarios).values(row);
  return { id: row.id, snapshotId, name, params, result, createdAt: row.createdAt };
}
export async function deleteScenario(owner: string, snapshotId: string, sid: string): Promise<boolean> {
  const { db, t } = await conn();
  const where = and(eq(t.scenarios.id, sid), eq(t.scenarios.snapshotId, snapshotId), eq(t.scenarios.ownerId, owner));
  const found = await db.select({ id: t.scenarios.id }).from(t.scenarios).where(where);
  if (!found.length) return false;
  await db.delete(t.scenarios).where(where);
  return true;
}

/** Sliding-window limiter backed by the events table. Returns retry-after seconds when blocked, else null (and records the event). */
export async function takeToken(owner: string, kind: "fetch" | "scenario", limit: number, windowMs = 3600_000): Promise<number | null> {
  const { db, t } = await conn();
  const now = Date.now();
  const rows = await db.select({ at: t.events.at }).from(t.events).where(and(eq(t.events.ownerId, owner), eq(t.events.kind, kind), gte(t.events.at, now - windowMs))).orderBy(t.events.at);
  if (rows.length >= limit) return Math.max(1, Math.ceil((Number(rows[0].at) + windowMs - now) / 1000));
  await db.insert(t.events).values({ ownerId: owner, kind, at: now });
  await db.delete(t.events).where(sql`${t.events.at} < ${now - 2 * windowMs}`);
  return null;
}
