import { useEffect, useState } from 'react';
import QR from 'qrcode';

/**
 * Gera um QR code (data URL) para o `value` dado. Offline, sem CDN.
 * Usado no lobby para juntar à sala apontando a câmara.
 */
export default function QRCode({ value, size = 160 }) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    let alive = true;
    QR.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: '#0f0f14', light: '#ffffff' },
    })
      .then((url) => alive && setDataUrl(url))
      .catch(() => alive && setDataUrl(null));
    return () => {
      alive = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-xl bg-white/10 animate-pulse"
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR code para juntar à sala"
      width={size}
      height={size}
      className="rounded-xl bg-white p-2"
    />
  );
}
