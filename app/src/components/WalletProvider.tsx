"use client";

import { ReactNode, useMemo } from "react";
// @ts-ignore - React 19 types incompatibility with wallet-adapter
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react";
// @ts-ignore
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import {
  RemoteSolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";
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

  // Explicit wallet adapters: Backpack (desktop extension) + a Solana Mobile
  // Wallet Adapter for Android Chrome.
  //
  // We use REMOTE association (via Solana Mobile's public reflector) instead of
  // local association. Local association dials ws://localhost on the device,
  // and Backpack's Android MWA local server fails to accept that loopback
  // connection (symptom: deep link opens, then a 30s ws://localhost timeout).
  // Remote association routes the connection over wss:// through the reflector,
  // which sidesteps the broken local server entirely. Desktop is unaffected
  // (it uses the Backpack extension).
  const wallets = useMemo(() => {
    const adapters: import("@solana/wallet-adapter-base").Adapter[] = [new BackpackWalletAdapter()];
    // Only add the MWA adapter on mobile (Android Chrome / Solana web shell).
    if (typeof window !== "undefined" && /Android/i.test(navigator.userAgent)) {
      adapters.push(
        new RemoteSolanaMobileWalletAdapter({
          addressSelector: createDefaultAddressSelector(),
          appIdentity: {
            name: "Gold Miner",
            uri: typeof window !== "undefined" ? window.location.origin : "https://goldminer.x1",
          },
          authorizationResultCache: createDefaultAuthorizationResultCache(),
          chain: "solana:testnet",
          remoteHostAuthority: "https://reflector.walletstandard.org",
          onWalletNotFound: createDefaultWalletNotFoundHandler(),
        })
      );
    }
    return adapters;
  }, []);

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