// Minimal shell so /dev/scenarios can run. The design team's layout (fonts, BottomNav,
// Tailwind) replaces this; keep the token names in globals.css when it does.
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pact",
  description: "Your money forecast, with a pact from your past self.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-colour-mode="standard">
      {/* Browser extensions (e.g. Grammarly) add attributes to <body>; don't report that as a hydration error. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
