import { pgTable, text, serial, bigint } from "drizzle-orm/pg-core";
// Same shape as schema.sqlite.ts; used when DATABASE_URL is set.
export const snapshots = pgTable("snapshots", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), capturedAt: text("captured_at").notNull(),
  sourceUrl: text("source_url").notNull(), data: text("data").notNull(), results: text("results").notNull(), verdict: text("verdict").notNull(),
});
export const scenarios = pgTable("scenarios", {
  id: text("id").primaryKey(), snapshotId: text("snapshot_id").notNull(), ownerId: text("owner_id").notNull(),
  name: text("name").notNull(), params: text("params").notNull(), result: text("result").notNull(), createdAt: text("created_at").notNull(),
});
export const events = pgTable("events", {
  id: serial("id").primaryKey(), ownerId: text("owner_id").notNull(), kind: text("kind").notNull(),
  at: bigint("at", { mode: "number" }).notNull(),
});
