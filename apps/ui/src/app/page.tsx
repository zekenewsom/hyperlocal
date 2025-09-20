import Link from 'next/link';

export default function Home() {
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Hyperlocal</h1>
      <p className="text-neutral-400">Local, signals-only market intelligence.</p>
      <nav className="space-x-4">
        <Link className="underline" href="/health">Health</Link>
        <Link className="underline" href="/settings">Settings</Link>
        <Link className="underline" href="/data-health">Data Health</Link>
        <Link className="underline" href={"/ingestor" as any}>Ingestor</Link>
        <span className="mx-2 text-neutral-600">|</span>
        <Link className="underline" href={"/explorer" as any}>Explorer</Link>
      </nav>
    </main>
  );
}
