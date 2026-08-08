import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import type { Reward } from '../../types/database';
import RedeemSuccessModal from '../../components/RedeemSuccessModal';

export default function Rewards() {
  const { profile, refreshProfile } = useAuth();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ rewardName: string; redeemCode: string } | null>(null);

  const loadRewards = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('rewards')
      .select('*')
      .eq('is_active', true)
      .order('point_cost', { ascending: true });
    setRewards((data as Reward[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadRewards();
  }, []);

  const handleRedeem = async (reward: Reward) => {
    setError(null);
    setRedeemingId(reward.id);
    const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: reward.id });
    setRedeemingId(null);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess({ rewardName: reward.name, redeemCode: data.redeem_code });
    await Promise.all([loadRewards(), refreshProfile()]);
  };

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Tukar Poin</h1>
        <p className="text-sm text-slate-500">Saldo kamu: {profile.points_balance} poin</p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Memuat reward...</p>
      ) : rewards.length === 0 ? (
        <p className="text-sm text-slate-400">Belum ada reward tersedia.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rewards.map((reward) => {
            const outOfStock = reward.stock !== null && reward.stock <= 0;
            const cantAfford = profile.points_balance < reward.point_cost;
            return (
              <div key={reward.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                {reward.image_url && (
                  <img src={reward.image_url} alt={reward.name} className="h-32 w-full rounded-lg object-cover" />
                )}
                <p className="font-medium text-slate-800">{reward.name}</p>
                {reward.description && <p className="text-xs text-slate-500">{reward.description}</p>}
                <p className="text-sm font-semibold text-emerald-700">{reward.point_cost} poin</p>
                {reward.stock !== null && <p className="text-xs text-slate-400">Stok: {reward.stock}</p>}
                <button
                  onClick={() => handleRedeem(reward)}
                  disabled={outOfStock || cantAfford || redeemingId === reward.id}
                  className="mt-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {redeemingId === reward.id
                    ? 'Memproses...'
                    : outOfStock
                      ? 'Stok Habis'
                      : cantAfford
                        ? 'Poin Tidak Cukup'
                        : 'Tukar Sekarang'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {success && (
        <RedeemSuccessModal
          rewardName={success.rewardName}
          redeemCode={success.redeemCode}
          onClose={() => setSuccess(null)}
        />
      )}
    </div>
  );
}
