export type Role = 'admin' | 'user';
export type MenuRole = 'admin' | 'user' | 'all';
export type TransactionType = 'earn' | 'redeem' | 'adjust';
export type RedemptionStatus = 'pending' | 'completed' | 'cancelled';
export type LandingSection = 'promo' | 'gallery';
export type OrderStatus = 'pending' | 'completed' | 'cancelled';
export type DiscountType = 'percent' | 'fixed';
export type PromoKind = 'discount' | 'bundle' | 'bogo';
export type PromoTargetMode = 'all' | 'percent' | 'top_spenders' | 'new_users' | 'specific' | 'random';

export interface Profile {
  id: string;
  member_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  points_balance: number;
  is_active: boolean;
  created_at: string;
}

export interface PointRules {
  id: string;
  rupiah_per_point: number;
  signup_bonus: number;
  points_expiry_days: number | null;
  max_redemptions_per_day: number | null;
  updated_at: string;
}

export interface PointTransaction {
  id: string;
  user_id: string;
  admin_id: string | null;
  type: TransactionType;
  points: number;
  amount_spent: number | null;
  description: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'name' | 'member_code'>;
}

export interface Reward {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  point_cost: number;
  stock: number | null;
  max_per_user: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Redemption {
  id: string;
  user_id: string;
  reward_id: string;
  points_used: number;
  redeem_code: string;
  status: RedemptionStatus;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
  rotating_token: string | null;
  rotating_token_expires_at: string | null;
  rewards?: Pick<Reward, 'name' | 'image_url'>;
  profiles?: Pick<Profile, 'name' | 'member_code'>;
}

export interface LandingItem {
  id: string;
  section: LandingSection;
  title: string | null;
  description: string | null;
  image_url: string;
  link_url: string | null;
  order: number;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  stock: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Promo {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  kind: PromoKind;
  discount_type: DiscountType | null;
  discount_value: number | null;
  min_order_amount: number | null;
  max_uses_per_user: number | null;
  bundle_price: number | null;
  bogo_buy_product_id: string | null;
  bogo_buy_qty: number;
  bogo_get_product_id: string | null;
  bogo_get_qty: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_mode: PromoTargetMode;
  target_percent: number | null;
  target_count: number | null;
  target_new_user_days: number | null;
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
}

export interface Order {
  id: string;
  user_id: string;
  subtotal: number;
  discount_amount: number;
  total: number;
  promo_id: string | null;
  order_code: string;
  status: OrderStatus;
  rotating_token: string | null;
  rotating_token_expires_at: string | null;
  expires_at: string | null;
  created_at: string;
  completed_at: string | null;
  order_items?: OrderItem[];
  promos?: Pick<Promo, 'title'>;
  profiles?: Pick<Profile, 'name' | 'member_code'>;
}

export interface Menu {
  id: string;
  label: string;
  path: string;
  icon: string | null;
  order: number;
  parent_id: string | null;
  role: MenuRole;
  is_active: boolean;
}
