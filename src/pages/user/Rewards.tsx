import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import type { PointRules, Reward } from '../../types/database';
import RedeemSuccessModal from '../../components/RedeemSuccessModal';
import Icon from '../../components/Icon';

function utcDayStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export default function Rewards() {
  const { profile, refreshProfile } = useAuth();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [usedCounts, setUsedCounts] = useState<Record<string, number>>({});
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    rewardName: string;
    redemptionId: string;
    redeemCode: string;
    rotatingToken: string;
  } | null>(null);

  const loadRewards = async () => {
    if (!profile) return;
    setLoading(true);

    const [{ data: rewardsData }, { data: myRedemptions }, { data: rulesData }, { count: todayRedemptions }] =
      await Promise.all([
        supabase.from('rewards').select('*').eq('is_active', true).order('point_cost', { ascending: true }),
        supabase.from('redemptions').select('reward_id').eq('user_id', profile.id).neq('status', 'cancelled'),
        supabase.from('point_rules').select('*').limit(1).single(),
        supabase
          .from('redemptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .neq('status', 'cancelled')
          .gte('created_at', utcDayStartIso()),
      ]);

    const counts: Record<string, number> = {};
    for (const row of myRedemptions ?? []) {
      counts[row.reward_id] = (counts[row.reward_id] ?? 0) + 1;
    }

    setRewards((rewardsData as Reward[]) ?? []);
    setUsedCounts(counts);
    setDailyLimit((rulesData as PointRules | null)?.max_redemptions_per_day ?? null);
    setTodayCount(todayRedemptions ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    loadRewards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const handleRedeem = async (reward: Reward) => {
    setError(null);
    setRedeemingId(reward.id);
    const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: reward.id });
    setRedeemingId(null);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess({
      rewardName: reward.name,
      redemptionId: data.id,
      redeemCode: data.redeem_code,
      rotatingToken: data.rotating_token,
    });
    await Promise.all([loadRewards(), refreshProfile()]);
  };

  if (!profile) return null;

  const dailyLimitReached = dailyLimit !== null && todayCount >= dailyLimit;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Tukar Poin</h1>
        <p className="text-sm text-slate-500">Saldo kamu: {profile.points_balance} poin</p>
        {dailyLimit !== null && (
          <p className="text-xs text-slate-400">
            Penukaran hari ini: {todayCount}/{dailyLimit}
          </p>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {dailyLimitReached && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Kamu sudah mencapai batas penukaran reward hari ini. Coba lagi besok.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Memuat reward...</p>
      ) : rewards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-10 text-center">
          <Icon name="Gift" size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">Belum ada reward tersedia.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rewards.map((reward) => {
            const outOfStock = reward.stock !== null && reward.stock <= 0;
            const cantAfford = profile.points_balance < reward.point_cost;
            const used = usedCounts[reward.id] ?? 0;
            const perRewardLimitReached = reward.max_per_user !== null && used >= reward.max_per_user;
            const disabled =
              outOfStock || cantAfford || perRewardLimitReached || dailyLimitReached || redeemingId === reward.id;
            return (
              <div
                key={reward.id}
                className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                {reward.image_url ? (
                  <img
                    src={reward.image_url}
                    alt={reward.name}
                    loading="lazy"
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-300">
                    Tanpa foto
                  </div>
                )}
                <p className="font-medium text-slate-800">{reward.name}</p>
                {reward.description && <p className="text-xs text-slate-500">{reward.description}</p>}
                <p className="text-sm font-semibold text-brand-green-700">{reward.point_cost} poin</p>
                <div className="flex flex-wrap gap-1.5">
                  {reward.stock !== null && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                      Stok: {reward.stock}
                    </span>
                  )}
                  {reward.max_per_user !== null && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                      Batas kamu: {used}/{reward.max_per_user}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleRedeem(reward)}
                  disabled={disabled}
                  className="mt-1 rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-700 disabled:opacity-40"
                >
                  {redeemingId === reward.id
                    ? 'Memproses...'
                    : outOfStock
                      ? 'Stok Habis'
                      : perRewardLimitReached
                        ? 'Batas Tercapai'
                        : dailyLimitReached
                          ? 'Batas Harian Tercapai'
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
          redemptionId={success.redemptionId}
          redeemCode={success.redeemCode}
          rotatingToken={success.rotatingToken}
          onClose={() => setSuccess(null)}
        />
      )}
    </div>
  );
}
