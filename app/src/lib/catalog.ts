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

export const CATALOG_STORAGE_KEY = 'grand-courtyard-catalog';
export const CATALOG_UPDATED_EVENT = 'grand-courtyard-catalog-updated';

export const ORIGINAL_CATALOG: CatalogCategory[] = [
  {
    id: 'food', name: 'Food & Catering', description: 'Build a menu your guests will remember.',
    subcategories: [
      { id: 'welcome-drinks', name: 'Welcome Drinks', items: [
        { id: 'welcome-classic', name: 'Classic Welcome Drinks', description: 'Seasonal sharbat, iced tea and infused water', categoryId: 'food', subcategoryId: 'welcome-drinks', price: 180, pricingType: 'perPerson', active: true, minQuantity: 1, maxQuantity: 1 },
        { id: 'welcome-signature', name: 'Signature Welcome Bar', description: 'Three house coolers with garnish station', categoryId: 'food', subcategoryId: 'welcome-drinks', price: 320, pricingType: 'perPerson', active: true, minQuantity: 1, maxQuantity: 1 },
      ] },
      { id: 'starters', name: 'Starters', items: [
        { id: 'starters-vegetarian', name: 'Vegetarian Starters', description: 'Four hot and cold vegetarian selections', categoryId: 'food', subcategoryId: 'starters', price: 290, pricingType: 'perPerson', active: true, minQuantity: 1, maxQuantity: 1 },
        { id: 'starters-live', name: 'Live Chaat Counter', description: 'Chef-led chaat counter with regional favourites', categoryId: 'food', subcategoryId: 'starters', price: 240, pricingType: 'perPerson', active: true, minQuantity: 1, maxQuantity: 1 },
      ] },
      { id: 'main-course', name: 'Main Course', items: [
        { id: 'main-indian', name: 'Indian Celebration Menu', description: 'Breads, rice, seasonal vegetables and two gravies', categoryId: 'food', subcategoryId: 'main-course', price: 520, pricingType: 'perPerson', active: true, minQuantity: 1, maxQuantity: 1 },
        { id: 'main-global', name: 'Indian & Global Menu', description: 'Indian classics with one continental live station', categoryId: 'food', subcategoryId: 'main-course', price: 690, pricingType: 'perPerson', active: true, minQuantity: 1, maxQuantity: 1 },
      ] },
      { id: 'desserts', name: 'Desserts', items: [
        { id: 'dessert-classic', name: 'Classic Dessert Table', description: 'Two Indian sweets, pastry and seasonal fruit', categoryId: 'food', subcategoryId: 'desserts', price: 210, pricingType: 'perPerson', active: true, minQuantity: 1, maxQuantity: 1 },
        { id: 'dessert-live', name: 'Live Dessert Studio', description: 'Fresh jalebi, kulfi and plated dessert service', categoryId: 'food', subcategoryId: 'desserts', price: 340, pricingType: 'perPerson', active: true, minQuantity: 1, maxQuantity: 1 },
      ] },
    ],
  },
  {
    id: 'decoration', name: 'Decoration', description: 'Set the room, entrance and atmosphere.',
    subcategories: [
      { id: 'stage', name: 'Stage', items: [
        { id: 'stage-floral', name: 'Floral Stage Story', description: 'Fresh foliage, layered drapes and couple seating', categoryId: 'decoration', subcategoryId: 'stage', price: 28000, pricingType: 'fixed', active: true, minQuantity: 1, maxQuantity: 1 },
        { id: 'stage-contemporary', name: 'Contemporary Stage', description: 'Textured backdrop, warm frames and statement florals', categoryId: 'decoration', subcategoryId: 'stage', price: 42000, pricingType: 'fixed', active: true, minQuantity: 1, maxQuantity: 1 },
      ] },
      { id: 'entrance', name: 'Entrance', items: [
        { id: 'entrance-floral', name: 'Floral Welcome Arch', description: 'Layered entry arch with welcome signage', categoryId: 'decoration', subcategoryId: 'entrance', price: 9500, pricingType: 'fixed', active: true, minQuantity: 1, maxQuantity: 1 },
        { id: 'entrance-minimal', name: 'Minimal Welcome Styling', description: 'Brass stands, foliage and custom easel sign', categoryId: 'decoration', subcategoryId: 'entrance', price: 6500, pricingType: 'fixed', active: true, minQuantity: 1, maxQuantity: 1 },
      ] },
      { id: 'lighting', name: 'Lighting', items: [
        { id: 'lighting-ambient', name: 'Ambient Lighting Zone', description: 'Warm wash lighting for one hall zone', categoryId: 'decoration', subcategoryId: 'lighting', price: 8500, pricingType: 'perUnit', active: true, minQuantity: 1, maxQuantity: 4 },
        { id: 'lighting-fairy', name: 'Fairy Light Canopy', description: 'Overhead canopy for an intimate evening glow', categoryId: 'decoration', subcategoryId: 'lighting', price: 12000, pricingType: 'perUnit', active: true, minQuantity: 1, maxQuantity: 3 },
      ] },
    ],
  },
  {
    id: 'fireworks', name: 'Fireworks', description: 'A considered finale for the evening.',
    subcategories: [{ id: 'fireworks-packages', name: 'Fireworks Packages', items: [
      { id: 'fireworks-garden', name: 'Garden Spark Package', description: 'Cold pyros and a 90-second finale, subject to venue approval', categoryId: 'fireworks', subcategoryId: 'fireworks-packages', price: 18500, pricingType: 'perUnit', active: true, minQuantity: 1, maxQuantity: 2 },
      { id: 'fireworks-grand', name: 'Grand Finale Package', description: 'Choreographed cold pyros and fountain sequence', categoryId: 'fireworks', subcategoryId: 'fireworks-packages', price: 32000, pricingType: 'perUnit', active: true, minQuantity: 1, maxQuantity: 1 },
    ] }],
  },
  {
    id: 'entertainment', name: 'Entertainment', description: 'Give the celebration its own rhythm.',
    subcategories: [{ id: 'music', name: 'Music', items: [
      { id: 'music-dj', name: 'DJ & Sound Console', description: 'Professional DJ, sound and dance-floor lighting', categoryId: 'entertainment', subcategoryId: 'music', price: 24000, pricingType: 'fixed', active: true, minQuantity: 1, maxQuantity: 1 },
      { id: 'music-live', name: 'Live Acoustic Set', description: 'Three-piece acoustic ensemble for cocktails and dinner', categoryId: 'entertainment', subcategoryId: 'music', price: 36000, pricingType: 'fixed', active: true, minQuantity: 1, maxQuantity: 1 },
    ] }],
  },
  {
    id: 'photography', name: 'Photography', description: 'Keep the feeling long after the last toast.',
    subcategories: [{ id: 'photography', name: 'Photography', items: [
      { id: 'photo-classic', name: 'Classic Photo Coverage', description: 'One candid photographer and a curated digital gallery', categoryId: 'photography', subcategoryId: 'photography', price: 38000, pricingType: 'fixed', active: true, minQuantity: 1, maxQuantity: 1 },
      { id: 'photo-cinema', name: 'Photo & Cinema Story', description: 'Photo team, highlight film and edited ceremony moments', categoryId: 'photography', subcategoryId: 'photography', price: 68000, pricingType: 'fixed', active: true, minQuantity: 1, maxQuantity: 1 },
    ] }],
  },
  {
    id: 'other', name: 'Other Services', description: 'The practical details that make the day easy.',
    subcategories: [{ id: 'other-services', name: 'Additional Services', items: [
      { id: 'other-valet', name: 'Valet Parking Coordination', description: 'On-ground coordination for a smooth guest arrival', categoryId: 'other', subcategoryId: 'other-services', price: 1400, pricingType: 'perUnit', active: true, minQuantity: 1, maxQuantity: 4 },
      { id: 'other-hostess', name: 'Guest Welcome Team', description: 'Trained hosts for entry, seating and guest assistance', categoryId: 'other', subcategoryId: 'other-services', price: 4500, pricingType: 'perUnit', active: true, minQuantity: 1, maxQuantity: 6 },
      { id: 'other-generator', name: 'Power Backup Cover', description: 'Event-ready backup power arrangement', categoryId: 'other', subcategoryId: 'other-services', price: 9500, pricingType: 'fixed', active: true, minQuantity: 1, maxQuantity: 1 },
    ] }],
  },
];

export const cloneCatalog = (catalog: CatalogCategory[] = ORIGINAL_CATALOG) =>
  catalog.map((category) => ({ ...category, subcategories: category.subcategories.map((subcategory) => ({ ...subcategory, items: subcategory.items.map((item) => ({ ...item })) })) }));

export function loadCatalog(): CatalogCategory[] {
  try {
    const saved = window.localStorage.getItem(CATALOG_STORAGE_KEY);
    if (!saved) return cloneCatalog();
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : cloneCatalog();
  } catch {
    return cloneCatalog();
  }
}

export function saveCatalog(catalog: CatalogCategory[]) {
  try {
    window.localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
    window.dispatchEvent(new CustomEvent(CATALOG_UPDATED_EVENT));
  } catch {
    // The UI remains usable if browser storage is unavailable.
  }
}

// Stores the cloud copy on this device as an offline fallback (no UI refresh event).
export function cacheCatalog(catalog: CatalogCategory[]) {
  try {
    window.localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
  } catch {
    // Ignore: the cloud copy is still used in memory.
  }
}

export const catalogStats = (catalog: CatalogCategory[]) => ({
  categories: catalog.length,
  subcategories: catalog.reduce((sum, category) => sum + category.subcategories.length, 0),
  services: catalog.reduce((sum, category) => sum + category.subcategories.reduce((inner, subcategory) => inner + subcategory.items.length, 0), 0),
  active: catalog.reduce((sum, category) => sum + category.subcategories.reduce((inner, subcategory) => inner + subcategory.items.filter((item) => item.active).length, 0), 0),
});