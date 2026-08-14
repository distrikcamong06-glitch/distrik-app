export default function ShareWhatsAppButton({ message, label = 'Bagikan ke WhatsApp' }: { message: string; label?: string }) {
  const handleShare = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
    >
      <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.02c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.81-.11-.42-.13-.95-.31-1.64-.6-2.88-1.24-4.76-4.14-4.9-4.33-.14-.19-1.17-1.56-1.17-2.97s.73-2.1.99-2.39c.26-.28.56-.36.75-.36.19 0 .38 0 .54.01.17.01.4-.07.63.48.24.57.81 1.98.88 2.12.07.14.12.31.02.5-.09.19-.14.3-.28.47-.14.16-.29.36-.42.49-.14.14-.28.28-.12.56.16.28.71 1.18 1.53 1.91 1.06.94 1.94 1.24 2.22 1.38.28.14.44.12.61-.07.16-.19.7-.81.89-1.09.19-.28.37-.23.63-.14.26.09 1.66.79 1.94.93.28.14.47.21.53.33.07.12.07.68-.17 1.35Z" />
      </svg>
      {label}
    </button>
  );
}
