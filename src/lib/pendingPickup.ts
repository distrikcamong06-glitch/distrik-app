import { supabase } from './supabaseClient';

export type PendingPickup = { type: 'order' | 'redemption' } | null;

export async function checkPendingPickup(userId: string): Promise<PendingPickup> {
  const now = new Date().toISOString();

  const [{ data: orders }, { data: redemptions }] = await Promise.all([
    supabase
      .from('orders')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1),
    supabase
      .from('redemptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1),
  ]);

  if (orders && orders.length > 0) return { type: 'order' };
  if (redemptions && redemptions.length > 0) return { type: 'redemption' };
  return null;
}
