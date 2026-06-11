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

export interface DiningTable {
  id: string;
  branch_id: string;
  table_number: string;
  qr_token: string;
  capacity: number;
  is_active: boolean;
}

export interface Order {
  id: string;
  branch_id: string;
  table_id: string;
  order_number: string;
  order_status: OrderStatus;
  customer_name: string | null;
  subtotal: number;
  tax: number;
  total: number;
  payment_status: "unpaid" | "paid";
  completed_at: string | null;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes: string | null;
}

export interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
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
