import { useAuth } from '../../contexts/AuthContext';
import BarcodeDisplay from '../../components/BarcodeDisplay';

export default function Barcode() {
  const { profile } = useAuth();

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Barcode Saya</h1>
        <p className="text-sm text-slate-500">Tunjukkan ke kasir saat belanja untuk kumpulkan poin.</p>
      </div>

      <BarcodeDisplay memberCode={profile.member_code} />

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <span className="text-sm text-slate-500">Saldo Poin</span>
        <span className="text-lg font-semibold text-brand-green-700">{profile.points_balance} poin</span>
      </div>
    </div>
  );
}
