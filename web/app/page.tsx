// Placeholder home. The Weather screen (F-tasks) replaces this file.
import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 20, maxWidth: 390, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22 }}>Pact</h1>
      <p>The Weather screen goes here.</p>
      <p>
        <Link href="/dev/scenarios" style={{ color: "var(--primary)", fontWeight: 700 }}>
          Open the mock scenario switcher
        </Link>
      </p>
    </main>
  );
}
