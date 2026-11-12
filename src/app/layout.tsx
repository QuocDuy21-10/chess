import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Combat Chess',
  description: 'Chess where every capture is a fight.',
};

// `cover` lets the page reach under a phone's notch and home bar; the HUD pads itself with env(safe-area-inset-*).
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
