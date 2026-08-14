import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { PointTransaction, Profile } from '../../types/database';
import ShareWhatsAppButton from '../../components/ShareWhatsAppButton';

export default function Members() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PointTransaction[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<{ id: string; text: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwBusyId, setPwBusyId] = useState<string | null>(null);
  const [pwMessage, setPwMessage] = useState<{ id: string; type: 'success' | 'error'; text: string } | null>(null);
  const [deductAmount, setDeductAmount] = useState('');
  const [deductReason, setDeductReason] = useState('');
  const [deductBusyId, setDeductBusyId] = useState<string | null>(null);
  const [deductMessage, setDeductMessage] = useState<{ id: string; type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [promoteBusyId, setPromoteBusyId] = useState<string | null>(null);

  const loadMembers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'user')
      .order('created_at', { ascending: false });
    setMembers((data as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const toggleActive = async (member: Profile) => {
    setBusyId(member.id);
    await supabase.from('profiles').update({ is_active: !member.is_active }).eq('id', member.id);
    setBusyId(null);
    await loadMembers();
  };

  const loadHistory = async (memberId: string) => {
    const { data } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('user_id', memberId)
      .order('created_at', { ascending: false })
      .limit(10);
    setHistory((data as PointTransaction[]) ?? []);
  };

  const toggleExpand = async (member: Profile) => {
    if (expandedId === member.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(member.id);
    await loadHistory(member.id);
  };

  const sendPasswordReset = async (member: Profile) => {
    if (!member.email) {
      setResetMessage({ id: member.id, text: 'Member ini tidak punya email tercatat.' });
      return;
    }
    setBusyId(member.id);
    const { error } = await supabase.auth.resetPasswordForEmail(member.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusyId(null);
    setResetMessage({
      id: member.id,
      text: error ? error.message : `Link reset password dikirim ke ${member.email}.`,
    });
  };

  const handleSetPassword = async (e: FormEvent, member: Profile) => {
    e.preventDefault();
    setPwBusyId(member.id);
    setPwMessage(null);

    const { error } = await supabase.functions.invoke('admin-set-password', {
      body: { user_id: member.id, new_password: newPassword },
    });

    setPwBusyId(null);
    if (error) {
      setPwMessage({ id: member.id, type: 'error', text: error.message });
      return;
    }
    setPwMessage({ id: member.id, type: 'success', text: 'Password member berhasil diganti.' });
    setNewPassword('');
  };

  const handleDeductPoints = async (e: FormEvent, member: Profile) => {
    e.preventDefault();
    setDeductBusyId(member.id);
    setDeductMessage(null);

    const { error } = await supabase.rpc('admin_deduct_points', {
      p_member_code: member.member_code,
      p_points: Number(deductAmount),
      p_reason: deductReason,
    });

    setDeductBusyId(null);
    if (error) {
      setDeductMessage({ id: member.id, type: 'error', text: error.message });
      return;
    }
    setDeductMessage({ id: member.id, type: 'success', text: `${deductAmount} poin dikurangi.` });
    setDeductAmount('');
    setDeductReason('');
    await loadMembers();
    await loadHistory(member.id);
  };

  const promoteToAdmin = async (member: Profile) => {
    if (!window.confirm(`Jadikan ${member.name} admin? Aksi ini memberi akses penuh ke dashboard admin.`)) return;
    setPromoteBusyId(member.id);
    const { error } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', member.id);
    setPromoteBusyId(null);
    if (error) {
      alert(error.message);
      return;
    }
    await loadMembers();
  };

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.member_code.toLowerCase().includes(q) || (m.phone ?? '').includes(q);
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-slate-800">Member</h1>
      <input
        placeholder="Cari nama, kode member, atau no. HP..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />

      {loading ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((member) => (
            <div key={member.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => toggleExpand(member)}>
                  <p className="truncate font-medium text-slate-800">{member.name}</p>
                  <p className="font-mono text-xs text-slate-400">{member.member_code}</p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-sm font-semibold text-emerald-700">{member.points_balance} poin</p>
                  <button
                    onClick={() => toggleActive(member)}
                    disabled={busyId === member.id}
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      member.is_active ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {member.is_active ? 'Aktif' : 'Diblokir'}
                  </button>
                </div>
              </div>

              {expandedId === member.id && (
                <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500">{member.email ?? 'Tidak ada email'}</p>

                  <ShareWhatsAppButton
                    phone={member.phone}
                    message={`Halo ${member.name}! Info poin Distrik Camong kamu:\nKode member: ${member.member_code}\nPoin saat ini: ${member.points_balance} poin`}
                    label="Kirim Info Poin ke WhatsApp"
                  />

                  <div className="flex flex-col gap-2 rounded-lg bg-red-50 p-3">
                    <p className="text-xs font-medium text-slate-600">Kurangi poin (wajib isi alasan)</p>
                    <form onSubmit={(e) => handleDeductPoints(e, member)} className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          required
                          min={1}
                          max={member.points_balance}
                          placeholder="Jumlah poin"
                          value={deductAmount}
                          onChange={(e) => setDeductAmount(e.target.value)}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                        />
                        <input
                          required
                          placeholder="Alasan (mis. poin salah input)"
                          value={deductReason}
                          onChange={(e) => setDeductReason(e.target.value)}
                          className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={deductBusyId === member.id}
                        className="rounded-lg bg-red-600 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deductBusyId === member.id ? 'Memproses...' : 'Kurangi Poin'}
                      </button>
                    </form>
                    {deductMessage?.id === member.id && (
                      <p className={`text-xs ${deductMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {deductMessage.text}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => promoteToAdmin(member)}
                    disabled={promoteBusyId === member.id}
                    className="rounded-lg border border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {promoteBusyId === member.id ? 'Memproses...' : 'Jadikan Admin'}
                  </button>

                  <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-600">Lupa password?</p>
                      <button
                        onClick={() => sendPasswordReset(member)}
                        disabled={busyId === member.id}
                        className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {busyId === member.id ? 'Mengirim...' : 'Kirim Link Reset'}
                      </button>
                    </div>
                    {resetMessage?.id === member.id && (
                      <p className="text-xs text-emerald-600">{resetMessage.text}</p>
                    )}

                    <form onSubmit={(e) => handleSetPassword(e, member)} className="flex gap-2">
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="Atau langsung set password baru"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={pwBusyId === member.id}
                        className="shrink-0 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {pwBusyId === member.id ? 'Menyimpan...' : 'Set Password'}
                      </button>
                    </form>
                    {pwMessage?.id === member.id && (
                      <p className={`text-xs ${pwMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {pwMessage.text}
                      </p>
                    )}
                  </div>

                  <p className="mb-1 text-xs font-medium text-slate-500">10 transaksi terakhir</p>
                  {history.length === 0 ? (
                    <p className="text-xs text-slate-400">Belum ada transaksi.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {history.map((tx) => (
                        <li key={tx.id} className="flex justify-between text-xs text-slate-600">
                          <span>
                            {tx.description ?? tx.type} · {new Date(tx.created_at).toLocaleDateString('id-ID')}
                          </span>
                          <span className={tx.points >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                            {tx.points >= 0 ? '+' : ''}
                            {tx.points}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
