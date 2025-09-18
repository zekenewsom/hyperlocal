import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'Hyperlocal', description: 'Local-only crypto signals' } as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100">{children}</body>
    </html>
  );
}

