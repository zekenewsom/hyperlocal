import './globals.css';
import type { ReactNode } from 'react';
import { Nav } from './nav';

export const metadata = { title: 'Hyperlocal', description: 'Local-only crypto signals' } as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100">
        <Nav />
        {children}
      </body>
    </html>
  );
}
