"use client";

import { ReactNode, useMemo } from "react";
// @ts-ignore - React 19 types incompatibility with wallet-adapter
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react";
// @ts-ignore
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { RPC_URL } from "@/lib/constants";

// Import wallet adapter CSS
import "@solana/wallet-adapter-react-ui/styles.css";

// Surface wallet-adapter errors (esp. Solana Mobile Wallet Adapter handshake
// failures) to the console + a visible banner so we can diagnose the real
// failure instead of a silent "Connecting to wallet..." hang.
function WalletErrorBanner({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <div style={{
      position: "fixed",
      bottom: 12, left: 12, right: 12, zIndex: 9999,
      background: "#7f1d1d", color: "#fecaca",
      border: "1px solid #ef4444", borderRadius: 10,
      padding: "10px 14px", fontSize: 12, fontFamily: "monospace",
      whiteSpace: "pre-wrap", wordBreak: "break-word",
      maxHeight: "40vh", overflow: "auto",
    }}>
      <strong>Wallet error:</strong> {error.message}
      {error.stack ? `\n${error.stack}` : ""}
    </div>
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  // Custom RPC endpoint for X1 Testnet
  const endpoint = RPC_URL;

  // Wallet-agnostic: pass an EMPTY wallet list so wallet-adapter-react
  // auto-discovers every wallet the device exposes via the wallet-standard
  // registry.
  //
  //  - Desktop: auto-discovers the Backpack extension (and any other
  //    installed extension).
  //  - Mobile: auto-discovers every Solana Mobile Wallet Adapter wallet the
  //    device exposes (Phantom, Solflare, Backpack, ...) and shows them all.
  //
  // We deliberately do NOT hardcode a single wallet here. Backpack's Android
  // app does not properly implement the MWA protocol (local association times
  // out on ws://localhost; remote association hangs on the reflector), so
  // forcing Backpack-only would block mobile connect entirely. Auto-discovery
  // lets the user pick a wallet that actually works (e.g. Phantom/Solflare).
  const wallets = useMemo(() => [], []);

  return (
    // @ts-ignore
    <ConnectionProvider endpoint={endpoint}>
      {/* @ts-ignore */}
      <SolanaWalletProvider
        wallets={wallets}
        autoConnect
        onError={(error) => {
          console.error("[WalletProvider] wallet error:", error);
          // Dispatch a custom event so the UI can render the banner
          window.dispatchEvent(new CustomEvent("wallet-error", { detail: error }));
        }}
      >
        {/* @ts-ignore */}
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}

export { WalletErrorBanner };