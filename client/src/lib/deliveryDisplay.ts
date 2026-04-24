/** Chuẩn hóa giờ từ API (TIME → "HH:mm") cho input type="time". */
export function deliveryTimeToInputValue(raw: unknown): string {
  if (raw == null || raw === '') return '';
  const s = String(raw);
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Hiển thị ngày (vi-VN) và giờ giao nếu có. */
export function formatNgayGioGiaoVI(deliveryDate?: string | null, deliveryTimeRaw?: unknown): string {
  let dateStr = '—';
  if (deliveryDate) {
    const iso = deliveryDate.length === 10 ? `${deliveryDate}T12:00:00` : deliveryDate;
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) {
      dateStr = new Date(ms).toLocaleDateString('vi-VN');
    } else {
      dateStr = deliveryDate;
    }
  }
  const t = deliveryTimeToInputValue(deliveryTimeRaw);
  if (!t) return dateStr;
  return `${dateStr} · ${t}`;
}
