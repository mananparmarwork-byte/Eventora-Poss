import type { CatalogCategory, CatalogItem, PricingType } from './types';

const item = (categoryId: string, subcategoryId: string, id: string, name: string, description: string, price: number, pricingType: PricingType, min = 1, max = 1): CatalogItem =>
  ({ id, name, description, categoryId, subcategoryId, price, pricingType, active: true, minQuantity: min, maxQuantity: max });

/** Starter menu. Everything here can be edited in Admin → Catalog. */
export const DEFAULT_CATALOG: CatalogCategory[] = [
  {
    id: 'food', name: 'Food & Catering', description: 'Build a menu your guests will remember.',
    subcategories: [
      { id: 'welcome-drinks', name: 'Welcome Drinks', items: [
        item('food', 'welcome-drinks', 'welcome-classic', 'Classic Welcome Drinks', 'Seasonal sharbat, iced tea and infused water', 60, 'perPerson'),
        item('food', 'welcome-drinks', 'welcome-signature', 'Signature Welcome Bar', 'Three house coolers with garnish station', 110, 'perPerson'),
      ] },
      { id: 'starters', name: 'Starters', items: [
        item('food', 'starters', 'starters-veg', 'Vegetarian Starters', 'Four hot and cold vegetarian selections', 180, 'perPerson'),
        item('food', 'starters', 'starters-chaat', 'Live Chaat Counter', 'Chef-led chaat counter with regional favourites', 120, 'perPerson'),
      ] },
      { id: 'main-course', name: 'Main Course', items: [
        item('food', 'main-course', 'main-indian', 'Indian Celebration Menu', 'Breads, rice, seasonal vegetables and two gravies', 450, 'perPerson'),
        item('food', 'main-course', 'main-global', 'Indian & Global Menu', 'Indian classics with one continental live station', 650, 'perPerson'),
      ] },
      { id: 'desserts', name: 'Desserts', items: [
        item('food', 'desserts', 'dessert-classic', 'Classic Dessert Table', 'Two Indian sweets, pastry and seasonal fruit', 140, 'perPerson'),
        item('food', 'desserts', 'dessert-live', 'Live Dessert Studio', 'Fresh jalebi, kulfi and plated dessert service', 220, 'perPerson'),
      ] },
    ],
  },
  {
    id: 'decoration', name: 'Decoration', description: 'Set the room, entrance and atmosphere.',
    subcategories: [
      { id: 'stage', name: 'Stage', items: [
        item('decoration', 'stage', 'stage-floral', 'Floral Stage Story', 'Fresh foliage, layered drapes and couple seating', 65000, 'fixed'),
        item('decoration', 'stage', 'stage-contemporary', 'Contemporary Stage', 'Textured backdrop, warm frames and statement florals', 85000, 'fixed'),
      ] },
      { id: 'entrance', name: 'Entrance', items: [
        item('decoration', 'entrance', 'entrance-floral', 'Floral Welcome Arch', 'Layered entry arch with welcome signage', 25000, 'fixed'),
        item('decoration', 'entrance', 'entrance-minimal', 'Minimal Welcome Styling', 'Brass stands, foliage and custom easel sign', 12000, 'fixed'),
      ] },
      { id: 'lighting', name: 'Lighting', items: [
        item('decoration', 'lighting', 'lighting-ambient', 'Ambient Lighting Zone', 'Warm wash lighting for one hall zone', 8000, 'perUnit', 1, 10),
        item('decoration', 'lighting', 'lighting-fairy', 'Fairy Light Canopy', 'Overhead canopy for an intimate evening glow', 30000, 'fixed'),
      ] },
    ],
  },
  {
    id: 'fireworks', name: 'Fireworks', description: 'A considered finale for the evening.',
    subcategories: [{ id: 'fireworks-packages', name: 'Fireworks Packages', items: [
      item('fireworks', 'fireworks-packages', 'fireworks-garden', 'Garden Spark Package', 'Cold pyros and a 90-second finale, subject to venue approval', 18000, 'fixed'),
      item('fireworks', 'fireworks-packages', 'fireworks-grand', 'Grand Finale Package', 'Choreographed cold pyros and fountain sequence', 45000, 'fixed'),
    ] }],
  },
  {
    id: 'entertainment', name: 'Entertainment', description: 'Give the celebration its own rhythm.',
    subcategories: [{ id: 'music', name: 'Music', items: [
      item('entertainment', 'music', 'music-dj', 'DJ & Sound Console', 'Professional DJ, sound and dance-floor lighting', 40000, 'fixed'),
      item('entertainment', 'music', 'music-live', 'Live Acoustic Set', 'Three-piece acoustic ensemble for cocktails and dinner', 55000, 'fixed'),
    ] }],
  },
  {
    id: 'photography', name: 'Photography', description: 'Keep the feeling long after the last toast.',
    subcategories: [{ id: 'photography-packages', name: 'Photography', items: [
      item('photography', 'photography-packages', 'photo-classic', 'Classic Photo Coverage', 'One candid photographer and a curated digital gallery', 35000, 'fixed'),
      item('photography', 'photography-packages', 'photo-cinema', 'Photo & Cinema Story', 'Photo team, highlight film and edited ceremony moments', 85000, 'fixed'),
    ] }],
  },
  {
    id: 'other', name: 'Other Services', description: 'The practical details that make the day easy.',
    subcategories: [{ id: 'other-services', name: 'Additional Services', items: [
      item('other', 'other-services', 'other-valet', 'Valet Parking Coordination', 'On-ground coordination for a smooth guest arrival', 9000, 'fixed'),
      item('other', 'other-services', 'other-hostess', 'Guest Welcome Team', 'Trained hosts for entry, seating and guest assistance', 1500, 'perUnit', 1, 20),
      item('other', 'other-services', 'other-generator', 'Power Backup Cover', 'Event-ready backup power arrangement', 12000, 'fixed'),
    ] }],
  },
];

export const cloneCatalog = (c: CatalogCategory[] = DEFAULT_CATALOG): CatalogCategory[] => JSON.parse(JSON.stringify(c));

export function catalogStats(catalog: CatalogCategory[]) {
  const items = catalog.flatMap((c) => c.subcategories.flatMap((s) => s.items));
  return { categories: catalog.length, subcategories: catalog.reduce((a, c) => a + c.subcategories.length, 0), services: items.length, active: items.filter((i) => i.active).length };
}
