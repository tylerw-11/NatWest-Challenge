import Link from "next/link";

// Placeholder until Feature 3 (Weather) replaces it.
export default function Home() {
  return (
    <main className="px-5 py-10">
      <h1 className="text-[22px] font-bold">Pact</h1>
      <p className="mt-2 text-ink-2">The Weather screen arrives in Feature 3.</p>
      <Link
        href="/dev/tokens"
        className="mt-6 inline-flex min-h-11 items-center font-bold text-primary underline"
      >
        See the design tokens
      </Link>
    </main>
  );
}
