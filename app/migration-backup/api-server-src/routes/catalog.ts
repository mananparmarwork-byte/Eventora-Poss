import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, catalogTable } from "@workspace/db";
import {
  GetCatalogResponse,
  UpdateCatalogBody,
  UpdateCatalogResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/catalog", async (_req, res): Promise<void> => {
  const [catalog] = await db
    .select({ categories: catalogTable.categories })
    .from(catalogTable)
    .where(eq(catalogTable.id, "default"));

  const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
  res.json(GetCatalogResponse.parse(categories));
});

router.put("/catalog", async (req, res): Promise<void> => {
  const parsed = UpdateCatalogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid catalog",
      issues: parsed.error.issues,
    });
    return;
  }

  const [savedCatalog] = await db
    .insert(catalogTable)
    .values({
      id: "default",
      categories: parsed.data,
    })
    .onConflictDoUpdate({
      target: catalogTable.id,
      set: {
        categories: parsed.data,
        updatedAt: new Date(),
      },
    })
    .returning({ categories: catalogTable.categories });

  res.json(UpdateCatalogResponse.parse(savedCatalog?.categories ?? parsed.data));
});

export default router;
