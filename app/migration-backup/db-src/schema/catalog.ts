import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const catalogTable = pgTable("catalog", {
  id: text("id").primaryKey(),
  categories: jsonb("categories").$type<unknown[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCatalogSchema = createInsertSchema(catalogTable).omit({
  updatedAt: true,
});
export type InsertCatalog = z.infer<typeof insertCatalogSchema>;
export type Catalog = typeof catalogTable.$inferSelect;
