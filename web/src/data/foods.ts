import { foods } from "./foods.generated";

// Food data is generated from USDA FoodData Central by scripts/build-foods.mjs.
export { foods, servingSizes } from "./foods.generated";

/** Food lookup map for fast access by id */
export const foodById = new Map(foods.map((f) => [f.id, f]));

/** Category display metadata */
export const categories: { id: string; name: string; emoji: string }[] = [
  { id: "fruits", name: "Fruits", emoji: "🍎" },
  { id: "vegetables", name: "Vegetables", emoji: "🥦" },
  { id: "protein", name: "Protein", emoji: "🍗" },
  { id: "grains", name: "Grains", emoji: "🌾" },
  { id: "dairy", name: "Dairy", emoji: "🧀" },
  { id: "snacks", name: "Nuts & Snacks", emoji: "🥜" },
  { id: "sweets", name: "Sweets", emoji: "🍰" },
  { id: "condiments", name: "Oils & Sauces", emoji: "🫒" },
  { id: "beverages", name: "Beverages", emoji: "☕" },
  { id: "meals", name: "Meals", emoji: "🍝" },
];
