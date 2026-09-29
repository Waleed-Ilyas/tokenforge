import type { Metadata } from "next";
import { Instrument_Serif, Geist, JetBrains_Mono } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { DevnetBanner } from "@/components/DevnetBanner";

const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "TokenForge | Create Solana tokens on devnet",
  description: "Create, mint and send SPL and Token-2022 tokens with metadata on Solana devnet. Connect Phantom, Solflare or Backpack.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${geist.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>
          <DevnetBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
