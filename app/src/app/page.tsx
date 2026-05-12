"use client";

import dynamic from "next/dynamic";

// Dynamically import the game UI to avoid SSR crashes from Solana wallet adapter
const GameUI = dynamic(() => import("@/components/GameUI"), { ssr: false });

export default function Home() {
  return <GameUI />;
}