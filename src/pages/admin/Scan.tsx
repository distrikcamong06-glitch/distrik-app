import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import QrScanner from '../../components/QrScanner';
import ShareWhatsAppButton from '../../components/ShareWhatsAppButton';
import type { Profile, Reward } from '../../types/database';

function utcDayStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export default function Scan() {
  const [member, setMember] = useState<Profile | null>(null);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [rewards, setRewards] = useState<Reward[]>([]);
  const [usedCounts, setUsedCounts] = useState<Record<string, number>>({});
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [todayCount, setTodayCount] = useState(0);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemResult, setRedeemResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleScan = async (rawInput: string) => {
    setResult(null);
    setLookupError(null);
    setMember(null);
    setSearchResults([]);

    const trimmed = rawInput.trim();
    if (!trimmed) return;

    const { data: byCode } = await supabase
      .from('profiles')
      .select('*')
      .eq('member_code', trimmed.toUpperCase())
      .maybeSingle();

    if (byCode) {
      setMember(byCode as Profile);
      return;
    }

    // Not a member code — try matching by phone number instead, in case
    // the member doesn't have their QR handy.
    const { data: byPhone } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'user')
      .ilike('phone', `%${trimmed}%`)
      .limit(10);

    if (byPhone && byPhone.length === 1) {
      setMember(byPhone[0] as Profile);
      return;
    }
    if (byPhone && byPhone.length > 1) {
      setSearchResults(byPhone as Profile[]);
      return;
    }

    setLookupError('Member dengan kode atau nomor HP tersebut tidak ditemukan.');
  };

  const loadRewardContext = async (memberId: string) => {
    const [{ data: rewardsData }, { data: memberRedemptions }, { data: rulesData }, { count: todayRedemptions }] =
      await Promise.all([
        supabase.from('rewards').select('*').eq('is_active', true).order('point_cost', { ascending: true }),
        supabase.from('redemptions').select('reward_id').eq('user_id', memberId).neq('status', 'cancelled'),
        supabase.from('point_rules').select('max_redemptions_per_day').limit(1).single(),
        supabase
          .from('redemptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', memberId)
          .neq('status', 'cancelled')
          .gte('created_at', utcDayStartIso()),
      ]);

    const counts: Record<string, number> = {};
    for (const row of memberRedemptions ?? []) {
      counts[row.reward_id] = (counts[row.reward_id] ?? 0) + 1;
    }

    setRewards((rewardsData as Reward[]) ?? []);
    setUsedCounts(counts);
    setDailyLimit((rulesData as { max_redemptions_per_day: number | null } | null)?.max_redemptions_per_day ?? null);
    setTodayCount(todayRedemptions ?? 0);
  };

  useEffect(() => {
    if (member) loadRewardContext(member.id);
    else {
      setRewards([]);
      setUsedCounts({});
      setRedeemResult(null);
    }
  }, [member]);

  const handleAddPoints = async (e: FormEvent) => {
    e.preventDefault();
    if (!member) return;
    setSubmitting(true);
    setResult(null);

    const { data, error } = await supabase.rpc('admin_add_points', {
      p_member_code: member.member_code,
      p_amount_spent: Number(amount),
    });

    setSubmitting(false);

    if (error) {
      setResult({ type: 'error', text: error.message });
      return;
    }

    setResult({ type: 'success', text: `+${data.points} poin ditambahkan untuk ${member.name}.` });
    setMember({ ...member, points_balance: member.points_balance + data.points });
    setAmount('');
  };

  const handleRedeemForMember = async (reward: Reward) => {
    if (!member) return;
    setRedeemingId(reward.id);
    setRedeemResult(null);

    const { data, error } = await supabase.rpc('admin_redeem_reward', {
      p_member_code: member.member_code,
      p_reward_id: reward.id,
    });

    setRedeemingId(null);

    if (error) {
      setRedeemResult({ type: 'error', text: error.message });
      return;
    }

    setRedeemResult({
      type: 'success',
      text: `${reward.name} berhasil ditukar untuk ${member.name}. Kode: ${data.redeem_code}`,
    });
    setMember({ ...member, points_balance: member.points_balance - reward.point_cost });
    await loadRewardContext(member.id);
  };

  const reset = () => {
    setMember(null);
    setSearchResults([]);
    setResult(null);
    setLookupError(null);
    setRedeemResult(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Scan Poin</h1>

      {!member && (
        <QrScanner onScan={handleScan} placeholder="Atau ketik kode member / nomor HP..." />
      )}
      {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}

      {searchResults.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium text-slate-500">
            Ditemukan {searchResults.length} member dengan nomor HP itu — pilih salah satu:
          </p>
          {searchResults.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMember(m);
                setSearchResults([]);
              }}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span>
                <span className="block font-medium text-slate-800">{m.name}</span>
                <span className="block text-xs text-slate-400">
                  {m.phone} · {m.member_code}
                </span>
              </span>
              <span className="text-xs font-medium text-brand-green-700">{m.points_balance} poin</span>
            </button>
          ))}
        </div>
      )}

      {member && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-800">{member.name}</p>
              <p className="font-mono text-xs text-slate-400">{member.member_code}</p>
              {member.phone && <p className="text-xs text-slate-400">{member.phone}</p>}
            </div>
            <p className="text-sm font-semibold text-brand-green-700">{member.points_balance} poin</p>
          </div>

          <form onSubmit={handleAddPoints} className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-600">
              Nominal belanja (Rp)
              <input
                type="number"
                required
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white hover:bg-brand-green-700 disabled:opacity-60"
            >
              {submitting ? 'Memproses...' : 'Tambah Poin'}
            </button>
          </form>

          {result && (
            <p className={`text-sm ${result.type === 'success' ? 'text-brand-green-600' : 'text-red-600'}`}>
              {result.text}
            </p>
          )}

          <ShareWhatsAppButton
            phone={member.phone}
            message={`Halo ${member.name}! Poin Distrik Camong kamu sekarang: ${member.points_balance} poin.`}
            label="Kirim Info Poin ke WhatsApp"
          />

          <div className="border-t border-slate-100 pt-3">
            <p className="mb-2 text-sm font-medium text-slate-600">
              Tukar reward untuk member ini (kalau lupa bawa HP)
            </p>
            {dailyLimit !== null && (
              <p className="mb-2 text-xs text-slate-400">
                Penukaran hari ini: {todayCount}/{dailyLimit}
              </p>
            )}
            {redeemResult && (
              <p className={`mb-2 text-xs ${redeemResult.type === 'success' ? 'text-brand-green-600' : 'text-red-600'}`}>
                {redeemResult.text}
              </p>
            )}
            {rewards.length === 0 ? (
              <p className="text-xs text-slate-400">Belum ada reward tersedia.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {rewards.map((reward) => {
                  const outOfStock = reward.stock !== null && reward.stock <= 0;
                  const cantAfford = member.points_balance < reward.point_cost;
                  const used = usedCounts[reward.id] ?? 0;
                  const perRewardLimitReached = reward.max_per_user !== null && used >= reward.max_per_user;
                  const dailyLimitReached = dailyLimit !== null && todayCount >= dailyLimit;
                  const disabled =
                    outOfStock || cantAfford || perRewardLimitReached || dailyLimitReached || redeemingId === reward.id;
                  return (
                    <div
                      key={reward.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{reward.name}</p>
                        <p className="text-xs text-slate-400">{reward.point_cost} poin</p>
                      </div>
                      <button
                        onClick={() => handleRedeemForMember(reward)}
                        disabled={disabled}
                        className="shrink-0 rounded-lg bg-brand-green-600 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                      >
                        {redeemingId === reward.id
                          ? 'Memproses...'
                          : outOfStock
                            ? 'Stok Habis'
                            : perRewardLimitReached
                              ? 'Batas Tercapai'
                              : dailyLimitReached
                                ? 'Batas Harian'
                                : cantAfford
                                  ? 'Poin Kurang'
                                  : 'Tukarkan'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button onClick={reset} className="text-sm text-slate-500 underline">
            Scan member lain
          </button>
        </div>
      )}
    </div>
  );
}
