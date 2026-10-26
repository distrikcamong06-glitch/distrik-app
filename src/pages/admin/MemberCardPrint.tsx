import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { MemberCardFront, MemberCardBack } from '../../components/MemberCard';
import Icon from '../../components/Icon';
import type { Profile } from '../../types/database';

export default function MemberCardPrint() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setMember((data as Profile) ?? null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p className="text-sm text-slate-400">Memuat...</p>;
  if (!member) return <p className="text-sm text-slate-400">Member tidak ditemukan.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Kartu Member</h1>
          <p className="text-sm text-slate-500">{member.name}</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-brand-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-700"
        >
          <Icon name="Printer" size={16} />
          Cetak
        </button>
      </div>

      <div className="flex flex-col items-center gap-6 print:gap-4">
        <div className="w-full max-w-sm print:max-w-none print:w-[90mm]">
          <MemberCardFront name={member.name} memberCode={member.member_code} phone={member.phone} />
        </div>
        <div className="w-full max-w-sm print:max-w-none print:w-[90mm]">
          <MemberCardBack memberCode={member.member_code} />
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 print:hidden">
        Gunakan "Cetak" lalu simpan sebagai PDF atau kirim langsung ke printer. Potong mengikuti sudut kartu.
      </p>
    </div>
  );
}
