import { qrMatrix } from '@/lib/qr';

// Draws the UPI QR code (plus the payee name and amount underneath) onto a canvas and returns it as a PNG.
// The PNG is what gets sent to the customer on WhatsApp as a photo.
export function qrPngBlob(value: string, caption: { title: string; amount: string }): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const matrix = qrMatrix(value);
      const quiet = 4;
      const modules = matrix.length + quiet * 2;
      const scale = Math.max(4, Math.floor(720 / modules));
      const qrSize = modules * scale;
      const pad = 36;
      const captionHeight = 120;
      const width = qrSize + pad * 2;
      const height = qrSize + pad * 2 + captionHeight;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas is not available.')); return; }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#171717';
      matrix.forEach((row, y) => row.forEach((dark, x) => {
        if (dark) ctx.fillRect(pad + (x + quiet) * scale, pad + (y + quiet) * scale, scale, scale);
      }));

      ctx.textAlign = 'center';
      ctx.fillStyle = '#263b31';
      ctx.font = '600 34px Georgia, "Times New Roman", serif';
      ctx.fillText(caption.title, width / 2, pad + qrSize + 44);
      ctx.fillStyle = '#C86B45';
      ctx.font = '700 40px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText(caption.amount, width / 2, pad + qrSize + 92);
      ctx.fillStyle = '#77736D';
      ctx.font = '400 22px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('Scan this QR with any UPI app to pay', width / 2, pad + qrSize + 122);

      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the QR image.'))), 'image/png');
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Could not create the QR image.'));
    }
  });
}
