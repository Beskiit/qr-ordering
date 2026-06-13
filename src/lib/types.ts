export type Role = "super_admin" | "tenant_admin" | "branch_admin" | "branch_staff";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  brand_color_dark: string;
  plan: "free" | "pro" | "enterprise";
  is_active: boolean;
  created_at: string;
}

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface Staff {
  id: string;
  tenant_id: string | null;
  branch_id: string | null;
  name: string;
  email: string;
  role: Role;
  avatar_url: string | null;
  is_active: boolean;
}

export interface Category {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  branch_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  display_order: number;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  branch_id: string;
  name: string;
  price: number;
  display_order: number;
}

export interface ProductAddon {
  id: string;
  product_id: string;
  branch_id: string;
  name: string;
  price: number;
  display_order: number;
}

export interface DiningTable {
  id: string;
  branch_id: string;
  table_number: string;
  qr_token: string;
  capacity: number;
  is_active: boolean;
}

export type OrderType = "dine_in" | "walk_in" | "pickup" | "delivery";

export interface Order {
  id: string;
  branch_id: string;
  table_id: string | null;
  order_number: string;
  order_status: OrderStatus;
  order_type: OrderType;
  customer_name: string | null;
  subtotal: number;
  tax: number;
  total: number;
  payment_status: "unpaid" | "paid";
  payment_method: PaymentChoice;
  amount_paid: number | null;
  change_due: number | null;
  paid_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type PaymentChoice = "counter" | "gcash" | "maya" | "bank";

export const PAYMENT_CHOICE_LABELS: Record<PaymentChoice, string> = {
  counter: "Pay at counter",
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank transfer",
};

/** App URL schemes for a best-effort "open the wallet app" deep link. */
export const WALLET_SCHEMES: Partial<Record<PaymentChoice, string>> = {
  gcash: "gcash://",
  maya: "paymaya://",
};

export interface OrderItemAddon {
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  variant_name: string | null;
  addons: OrderItemAddon[];
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes: string | null;
}

export interface CartItem {
  key: string; // product + variant + add-ons signature; identical combos stack
  product: Product;
  variant: ProductVariant | null;
  addons: ProductAddon[];
  quantity: number;
  notes: string;
}

/** Per-unit price = size price (or base) + selected add-ons. */
export function lineUnitPrice(item: CartItem): number {
  const base = item.variant ? Number(item.variant.price) : Number(item.product.price);
  const addons = item.addons.reduce((sum, a) => sum + Number(a.price), 0);
  return base + addons;
}

/** Stable signature so the same product+size+add-ons stacks into one line. */
export function cartKey(
  productId: string,
  variantId: string | null,
  addonIds: string[]
): string {
  return `${productId}|${variantId ?? ""}|${[...addonIds].sort().join(",")}`;
}

export interface ActivityLog {
  id: string;
  tenant_id: string | null;
  branch_id: string | null;
  actor_id: string | null;
  actor_name: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export type PaymentMethodType = "gcash" | "maya" | "bank";

export interface PaymentMethod {
  id: string;
  tenant_id: string;
  type: PaymentMethodType;
  account_name: string | null;
  account_number: string | null;
  qr_url: string | null;
  is_enabled: boolean;
  display_order: number;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank transfer",
};

/** Human label for where an order goes (table, or its type). */
export function orderDestination(
  orderType: OrderType | null | undefined,
  tableNumber: string | null
): string {
  if (tableNumber) return `Table ${tableNumber}`;
  switch (orderType) {
    case "pickup":
      return "Pickup";
    case "delivery":
      return "Delivery";
    case "dine_in":
      return "Dine-in";
    default:
      return "Walk-in";
  }
}

export interface CashCount {
  id: string;
  branch_id: string;
  staff_id: string | null;
  staff_name: string;
  business_date: string;
  starting_float: number;
  expected_cash: number;
  counted_cash: number;
  variance: number;
  left_in_drawer: number | null;
  notes: string | null;
  created_at: string;
}

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
];

export const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-violet-100 text-violet-800",
  ready: "bg-emerald-100 text-emerald-800",
  completed: "bg-gray-200 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
};

export function formatMoney(n: number | string): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(n));
}
