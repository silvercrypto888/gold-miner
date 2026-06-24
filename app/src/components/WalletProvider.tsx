"use client";

import { ReactNode, useMemo } from "react";
// @ts-ignore - React 19 types incompatibility with wallet-adapter
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react";
// @ts-ignore
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { RPC_URL } from "@/lib/constants";

// Import wallet adapter CSS
import "@solana/wallet-adapter-react-ui/styles.css";

export function WalletProvider({ children }: { children: ReactNode }) {
  // Custom RPC endpoint for X1 Testnet
  const endpoint = RPC_URL;

  // Explicit wallet adapters for Backpack + wallet-standard auto-discover
  const wallets = useMemo(() => [new BackpackWalletAdapter()], []);

  return (
    // @ts-ignore
    <ConnectionProvider endpoint={endpoint}>
      {/* @ts-ignore */}
      <SolanaWalletProvider wallets={wallets} autoConnect>
        {/* @ts-ignore */}
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}