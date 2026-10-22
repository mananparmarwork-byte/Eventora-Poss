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
export type QuotePayment = { id: string; amount: number; method: PaymentMethod; kind: PaymentKind; paidAt: string; note?: string; by?: string };

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

/* ------------------------------------------------------------ Roles & audit --- */
export type Role = 'admin' | 'staff';
export type Session = { email: string; role: Role } | null;

/** What an employee may do. The owner changes these in Settings → Team. */
/** `deleteBills` is always false: employees can never delete a bill (the database enforces it, no switch exists). */
export type StaffPermissions = { deleteBills: boolean; editBills: boolean; removePayments: boolean; markBooked: boolean; discounts: boolean; viewAllBills: boolean };
export const DEFAULT_PERMISSIONS: StaffPermissions = { deleteBills: false, editBills: true, removePayments: true, markBooked: true, discounts: true, viewAllBills: true };

/** Bill numbers look like EV-201026-1001 (prefix, day DDMMYY, running number). The running number restarts at `start` every day. */
export type NumberingSettings = { prefix: string; start: number };
export const DEFAULT_NUMBERING: NumberingSettings = { prefix: 'EV', start: 1001 };

export type ActivitySettings = { retentionDays: number }; // 0 = keep forever
export const DEFAULT_ACTIVITY_SETTINGS: ActivitySettings = { retentionDays: 0 };

export type ActivityAction =
  | 'bill.created' | 'bill.updated' | 'bill.deleted' | 'bill.booked' | 'bill.released'
  | 'payment.received' | 'payment.removed' | 'payment.request' | 'settings.changed';

export type ActivityChange = { label: string; from?: string; to?: string };
export type ActivityData = {
  changes?: ActivityChange[];
  amount?: number; method?: string; kind?: string; txn?: string; paymentId?: string; balance?: number;
  total?: number; customer?: string; mobile?: string; eventType?: string; dates?: string; guests?: number;
  services?: string[]; received?: number;
};
export type ActivityEntry = {
  id: string; at: string; actorEmail: string; actorRole: Role | 'public' | 'system';
  action: ActivityAction; reference: string; title: string; detail: string; data: ActivityData; legacy?: boolean;
};
export type ActivityDraft = Omit<ActivityEntry, 'id' | 'at' | 'actorEmail' | 'actorRole' | 'legacy'>;

export type StaffMember = { id: string; email: string; active: boolean };
