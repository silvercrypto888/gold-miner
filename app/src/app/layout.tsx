import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gold Miner - On-Chain Grid Game",
  description: "A multiplayer on-chain grid game on X1. Mine gold, collect GOLD tokens.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
