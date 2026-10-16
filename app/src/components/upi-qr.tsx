import { useMemo } from 'react';
import { qrMatrix } from '@/lib/qr';

// QR code drawn as one SVG path (white quiet zone included so phone cameras scan it easily).
export function UpiQr({ value, className = 'h-44 w-44 sm:h-52 sm:w-52' }: { value: string; className?: string }) {
  const matrix = useMemo(() => {
    try { return qrMatrix(value); } catch { return null; }
  }, [value]);
  if (!matrix) return <p className="text-xs text-[#a13d32]">This payment link is too long for a QR code.</p>;
  const quiet = 3;
  const size = matrix.length + quiet * 2;
  let path = '';
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={`${className} rounded-xl border border-[#e3d8c9] bg-white p-1 shadow-sm`} role="img" aria-label="UPI payment QR code" shapeRendering="crispEdges" data-testid="img-upi-qr">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#171717" />
    </svg>
  );
}
