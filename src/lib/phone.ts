// Normalizes an Indonesian phone number into the digits-only international
// format wa.me expects (e.g. "0812-3456-7890" -> "6281234567890").
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return `62${digits}`;
}
