import { useAuth } from '../../contexts/AuthContext';
import BarcodeDisplay from '../../components/BarcodeDisplay';

export default function Barcode() {
  const { profile } = useAuth();
  if (!profile) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Barcode Member</h1>
        <p className="text-sm text-slate-500">Tunjukkan ini ke kasir saat belanja di toko.</p>
      </div>

      <div className="rounded-2xl bg-brand-green-600 p-5 text-white">
        <p className="text-sm opacity-80">Saldo Poin</p>
        <p className="text-3xl font-semibold">{profile.points_balance}</p>
      </div>

      <BarcodeDisplay memberCode={profile.member_code} />
    </div>
  );
}
