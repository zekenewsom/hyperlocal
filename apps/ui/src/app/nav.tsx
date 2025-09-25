'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Home' },
  { href: '/ingestor', label: 'Ingestor' },
  { href: '/data-health', label: 'Data Health' },
  { href: '/explorer', label: 'Explorer' },
  { href: '/settings', label: 'Settings' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/60 border-b border-neutral-900">
      <div className="px-4 h-12 flex items-center gap-4">
        <Link href="/" className="font-semibold">Hyperlocal</Link>
        <div className="text-neutral-600">|</div>
        <div className="flex items-center gap-3 text-sm">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`${active ? 'text-emerald-400' : 'text-neutral-300 hover:text-white'} transition-colors`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto text-xs text-neutral-500">
          Local-only • No keys needed
        </div>
      </div>
    </nav>
  );
}

