import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { CreateQuoteBody, CreateQuoteResponse, DeleteQuoteParams, GetQuoteParams, GetQuoteResponse, ListQuotesQueryParams, ListQuotesResponse } from "@workspace/api-zod";
import { db, quotesTable } from "@workspace/db";

const router: IRouter = Router();

function toApiQuote(quote: typeof quotesTable.$inferSelect) {
  const pricing = quote.pricing as Record<string, unknown>;
  return {
    reference: quote.reference,
    customer: {
      name: quote.customerName,
      mobile: quote.mobile,
      eventType: quote.eventType,
      eventDate: new Date(`${quote.eventDate}T00:00:00.000Z`),
      guests: quote.guests,
      gstNumber: quote.customerGstNumber ?? "",
      hall: quote.hall,
    },
    services: quote.services,
    pricing: {
      ...pricing,
      // Keep quotes created before the hall GST settings were added readable.
      gstNumber: typeof pricing.gstNumber === "string" ? pricing.gstNumber : "",
      gstNumberVisible: typeof pricing.gstNumberVisible === "boolean" ? pricing.gstNumberVisible : false,
    },
    id: quote.id,
    createdAt: quote.createdAt,
    status: quote.status,
  };
}

router.get("/quotes", async (req, res): Promise<void> => {
  const parsedQuery = ListQuotesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const quotes = await db
    .select()
    .from(quotesTable)
    .orderBy(desc(quotesTable.createdAt))
    .limit(parsedQuery.data.limit);

  res.json(ListQuotesResponse.parse(quotes.map(toApiQuote)));
});

router.post("/quotes", async (req, res): Promise<void> => {
  const parsedBody = CreateQuoteBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.reference, parsedBody.data.reference));

  if (existing[0]) {
    res.status(201).json(CreateQuoteResponse.parse(toApiQuote(existing[0])));
    return;
  }

  const [quote] = await db
    .insert(quotesTable)
    .values({
      id: randomUUID(),
      reference: parsedBody.data.reference,
      customerName: parsedBody.data.customer.name,
      mobile: parsedBody.data.customer.mobile,
      eventType: parsedBody.data.customer.eventType,
      eventDate: parsedBody.data.customer.eventDate.toISOString().slice(0, 10),
      guests: parsedBody.data.customer.guests,
      customerGstNumber: parsedBody.data.customer.gstNumber ?? "",
      hall: parsedBody.data.customer.hall,
      services: parsedBody.data.services,
      pricing: parsedBody.data.pricing,
      status: "new",
    })
    .returning();

  res.status(201).json(CreateQuoteResponse.parse(toApiQuote(quote)));
});

router.get("/quotes/:reference", async (req, res): Promise<void> => {
  const parsedParams = GetQuoteParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.reference, parsedParams.data.reference));

  if (!quote) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  res.json(GetQuoteResponse.parse(toApiQuote(quote)));
});

router.delete("/quotes/:reference", async (req, res): Promise<void> => {
  const parsedParams = DeleteQuoteParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }

  const [deletedQuote] = await db
    .delete(quotesTable)
    .where(eq(quotesTable.reference, parsedParams.data.reference))
    .returning({ reference: quotesTable.reference });

  if (!deletedQuote) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  res.status(204).send();
});

export default router;
