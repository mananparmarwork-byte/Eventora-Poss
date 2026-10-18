export type PricingType = 'perPerson' | 'fixed' | 'perUnit';

export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  price: number;
  pricingType: PricingType;
  active: boolean;
  minQuantity: number;
  maxQuantity: number;
};
export type CatalogSubcategory = { id: string; name: string; items: CatalogItem[] };
export type CatalogCategory = { id: string; name: string; description: string; subcategories: CatalogSubcategory[] };

/** 24-hour "HH:MM" text. An empty range means "time not chosen yet". */
export type TimeRange = { start: string; end: string };
export type EventSlots = Record<string, TimeRange | undefined>;

export type QuoteService = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  pricingType: PricingType;
  quantity: number;
  unitPrice: number;
  total: number;
  description?: string;
};

export type QuoteCustomer = {
  name: string;
  mobile: string;
  eventType: string;
  eventDate: string;
  eventDates?: string[];
  eventSlots?: EventSlots;
  guests: number;
  gstNumber?: string;
  hall: string;
};

export type PaymentMethod = 'upi' | 'cash' | 'bank';
export type PaymentKind = 'advance' | 'full';
export type QuotePayment = { id: string; amount: number; method: PaymentMethod; kind: PaymentKind; paidAt: string; note?: string };

export type QuotePricing = {
  foodPerPlate: number;
  subtotal: number;
  gstEnabled: boolean;
  gstRate: number;
  gstAmount: number;
  gstNumber: string;
  gstNumberVisible: boolean;
  customerGstNumberVisible?: boolean;
  showCostPerGuest?: boolean;
  eventDates?: string[];
  eventSlots?: EventSlots;
  discountEnabled?: boolean;
  discountPercent?: number;
  discountFlat?: number;
  discountAmount?: number;
  grandTotal: number;
  costPerGuest: number;
  advancePaid?: boolean;
  advanceAmount?: number;
  balanceDue?: number;
  payments?: QuotePayment[];
};

export type QuoteStatus = 'new' | 'contacted' | 'confirmed' | 'archived';
export type QuoteInput = { reference: string; customer: QuoteCustomer; services: QuoteService[]; pricing: QuotePricing };
export type Quote = QuoteInput & { id: string; createdAt: string; status: QuoteStatus };

export type BusinessProfile = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  website: string;
  terms: string;
  footerNote: string;
  signatory: string;
  gstSplit: boolean; // show CGST + SGST instead of a single GST line
  logo?: string; // optional PNG data URL printed on bills
};

export type PaymentSettings = {
  upiId: string;
  payeeName: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
};
