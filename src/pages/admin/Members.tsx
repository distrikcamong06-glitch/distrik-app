import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { PointTransaction, Profile } from '../../types/database';

export default function Members() {
  const [members, setMembers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<PointTransaction[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<{ id: string; text: string } | null>(null);

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

  const toggleExpand = async (member: Profile) => {
    if (expandedId === member.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(member.id);
    const { data } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('user_id', member.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setHistory((data as PointTransaction[]) ?? []);
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
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">{member.email ?? 'Tidak ada email'}</p>
                    <button
                      onClick={() => sendPasswordReset(member)}
                      disabled={busyId === member.id}
                      className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busyId === member.id ? 'Mengirim...' : 'Kirim Reset Password'}
                    </button>
                  </div>
                  {resetMessage?.id === member.id && (
                    <p className="mb-3 text-xs text-emerald-600">{resetMessage.text}</p>
                  )}

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
