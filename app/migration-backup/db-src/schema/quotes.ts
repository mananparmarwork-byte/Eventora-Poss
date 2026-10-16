import { createInsertSchema } from "drizzle-zod";
import { date, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const quotesTable = pgTable("quotes", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  customerName: text("customer_name").notNull(),
  mobile: text("mobile").notNull(),
  eventType: text("event_type").notNull(),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  guests: integer("guests").notNull(),
  customerGstNumber: text("customer_gst_number"),
  hall: text("hall").notNull(),
  services: jsonb("services").$type<unknown[]>().notNull(),
  pricing: jsonb("pricing").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({
  createdAt: true,
});
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
