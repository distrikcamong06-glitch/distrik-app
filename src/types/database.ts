export type Role = 'admin' | 'user';
export type MenuRole = 'admin' | 'user' | 'all';
export type TransactionType = 'earn' | 'redeem' | 'adjust';
export type RedemptionStatus = 'pending' | 'completed' | 'cancelled';

export interface Profile {
  id: string;
  member_code: string;
  name: string;
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
  rewards?: Pick<Reward, 'name' | 'image_url'>;
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
