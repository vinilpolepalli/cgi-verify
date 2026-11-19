import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  capturedAt: text("captured_at").notNull(),
  sourceUrl: text("source_url").notNull(),
  data: text("data").notNull(), // JSON: SnapshotData
  results: text("results").notNull(), // JSON: SkuRecompute[]
  verdict: text("verdict").notNull(), // "pass" | "flag"
});
export const scenarios = sqliteTable("scenarios", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  params: text("params").notNull(), // JSON
  result: text("result").notNull(), // JSON
  createdAt: text("created_at").notNull(),
});
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(), // "fetch" | "scenario"
  at: integer("at").notNull(), // epoch ms
});
