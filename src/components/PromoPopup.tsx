import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import type { LandingItem } from '../types/database';

function dismissedKey(userId: string) {
  return `dismissed-promos:${userId}`;
}

function getDismissed(userId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(dismissedKey(userId)) ?? '[]');
  } catch {
    return [];
  }
}

function markDismissed(userId: string, promoId: string) {
  try {
    const current = getDismissed(userId);
    localStorage.setItem(dismissedKey(userId), JSON.stringify([...current, promoId]));
  } catch {
    // localStorage unavailable (private mode etc) — just skip persisting, harmless
  }
}

export default function PromoPopup({ userId }: { userId: string }) {
  const [promo, setPromo] = useState<LandingItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from('landing_items')
      .select('*')
      .eq('section', 'promo')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        const latest = (data as LandingItem[] | null)?.[0];
        if (latest && !getDismissed(userId).includes(latest.id)) {
          setPromo(latest);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!promo) return null;

  const close = () => {
    markDismissed(userId, promo.id);
    setPromo(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={close}>
      <div
        className="animate-success-in relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          aria-label="Tutup"
          className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1 text-slate-500 shadow hover:text-slate-700"
        >
          <X size={18} />
        </button>

        <img src={promo.image_url} alt={promo.title ?? 'Promo'} className="aspect-square w-full object-cover" />

        {(promo.title || promo.description) && (
          <div className="flex flex-col gap-1 p-4 text-center">
            {promo.title && <p className="font-classic text-lg font-bold text-slate-800">{promo.title}</p>}
            {promo.description && <p className="text-sm text-slate-500">{promo.description}</p>}
          </div>
        )}

        <div className="p-4 pt-0">
          {promo.link_url ? (
            <a
              href={promo.link_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className="block w-full rounded-lg bg-brand-green-600 py-2 text-center text-sm font-medium text-white hover:bg-brand-green-700"
            >
              Lihat Promo
            </a>
          ) : (
            <button
              onClick={close}
              className="w-full rounded-lg bg-brand-green-600 py-2 text-sm font-medium text-white hover:bg-brand-green-700"
            >
              Oke, Mengerti
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
