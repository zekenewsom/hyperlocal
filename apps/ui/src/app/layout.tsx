import './globals.css';
import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata = { title: 'Hyperlocal', description: 'Local-only crypto signals' } as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100">
        <nav className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60 border-b border-neutral-900">
          <div className="px-4 h-12 flex items-center gap-4">
            <Link href="/" className="font-semibold">Hyperlocal</Link>
            <div className="text-neutral-500">|</div>
            <Link href="/ingestor" className="hover:underline">Ingestor</Link>
            <Link href="/data-health" className="hover:underline">Data Health</Link>
            <Link href="/explorer" className="hover:underline">Explorer</Link>
            <Link href="/settings" className="hover:underline">Settings</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
