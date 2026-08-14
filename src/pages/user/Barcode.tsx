import { useAuth } from '../../contexts/AuthContext';
import BarcodeDisplay from '../../components/BarcodeDisplay';
import ShareWhatsAppButton from '../../components/ShareWhatsAppButton';

export default function Barcode() {
  const { profile } = useAuth();
  if (!profile) return null;

  const shareMessage = `Halo! Ini kode member Distrik Camong aku: ${profile.member_code}\nPoin saat ini: ${profile.points_balance} poin.\nYuk gabung juga jadi member Distrik Camong!`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Barcode Member</h1>
        <p className="text-sm text-slate-500">Tunjukkan ini ke kasir saat belanja di toko.</p>
      </div>

      <div className="rounded-2xl bg-emerald-600 p-5 text-white">
        <p className="text-sm opacity-80">Saldo Poin</p>
        <p className="text-3xl font-semibold">{profile.points_balance}</p>
      </div>

      <BarcodeDisplay memberCode={profile.member_code} />

      <ShareWhatsAppButton message={shareMessage} label="Bagikan Poin & Kode Member" />
    </div>
  );
}
