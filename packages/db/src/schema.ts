import { relations } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const persons = pgTable("persons", {
  id: uuid("id").defaultRandom().primaryKey(),
  googleId: text("google_id").notNull().unique(),
  name: text("name").notNull(),
  photoUrl: text("photo_url"),
  isSelf: boolean("is_self").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable(
  "locations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracyM: real("accuracy_m"),
    address: text("address"),
    batteryPct: integer("battery_pct"),
    charging: boolean("charging"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("locations_person_recorded_idx").on(t.personId, t.recordedAt)],
);

export const syncState = pgTable("sync_state", {
  id: integer("id").primaryKey().default(1),
  cookiesEncrypted: text("cookies_encrypted"),
  lastPollAt: timestamp("last_poll_at", { withTimezone: true }),
  lastError: text("last_error"),
  sessionValid: boolean("session_valid").notNull().default(false),
});

export const syncLog = pgTable("sync_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  peopleCount: integer("people_count"),
  pointsInserted: integer("points_inserted"),
  ok: boolean("ok").notNull(),
  error: text("error"),
});

export const alertState = pgTable("alert_state", {
  key: text("key").primaryKey(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
  payload: text("payload"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const personsRelations = relations(persons, ({ many }) => ({
  locations: many(locations),
}));

export const locationsRelations = relations(locations, ({ one }) => ({
  person: one(persons, { fields: [locations.personId], references: [persons.id] }),
}));

export type Person = typeof persons.$inferSelect;
export type LocationPoint = typeof locations.$inferSelect;
export type SyncState = typeof syncState.$inferSelect;
export type SyncLogEntry = typeof syncLog.$inferSelect;
export type AlertState = typeof alertState.$inferSelect;
