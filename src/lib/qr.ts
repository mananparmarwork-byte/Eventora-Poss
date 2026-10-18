import QRCode from 'qrcode';

/** PNG data URL of a QR code (used on screen and inside the PDF). */
export function qrDataUrl(value: string, width = 320): Promise<string> {
  return QRCode.toDataURL(value, { width, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B1733', light: '#FFFFFF' } });
}

/** QR card as a PNG blob, ready to send on WhatsApp. */
export async function qrCardBlob(value: string, caption: { title: string; amount: string }): Promise<Blob> {
  const qr = await qrDataUrl(value, 640);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not build the QR image.'));
    i.src = qr;
  });
  const pad = 40;
  const w = 640 + pad * 2;
  const h = 640 + pad * 2 + 130;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, pad, pad, 640, 640);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0B1733'; ctx.font = '600 34px Georgia, serif';
  ctx.fillText(caption.title, w / 2, pad + 640 + 44);
  ctx.fillStyle = '#B8861B'; ctx.font = '700 42px Arial, sans-serif';
  ctx.fillText(caption.amount, w / 2, pad + 640 + 94);
  ctx.fillStyle = '#6B7385'; ctx.font = '400 22px Arial, sans-serif';
  ctx.fillText('Scan with any UPI app to pay', w / 2, pad + 640 + 124);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not build the QR image.'))), 'image/png'));
}
