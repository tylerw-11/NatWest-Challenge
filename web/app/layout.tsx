import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { PhoneFrame } from "@/components/PhoneFrame";

const atkinson = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-atkinson",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pact",
  description: "Your money weather, with a plan for the storms.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F5F6F2",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-colour-mode="standard" className={atkinson.variable}>
      <body>
        <Providers>
          <PhoneFrame>{children}</PhoneFrame>
        </Providers>
      </body>
    </html>
  );
}
