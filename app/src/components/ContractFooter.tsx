"use client";

import { useState } from "react";
import { getGoldMint, getProgramId } from "@/lib/constants";

// Simple copy-to-clipboard chip with inline "copied" feedback
function AddressChip({ label, address, accent }: { label: string; address: string; accent: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-800/50">
      <span className="text-xs text-gray-400 whitespace-nowrap">{label}</span>
      <code
        className="font-mono text-xs text-gray-300 truncate max-w-[140px] sm:max-w-[220px] md:max-w-[280px]"
        title={address}
      >
        {address}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        title={copied ? "Copied!" : `Copy ${label}`}
        className={`shrink-0 p-1 rounded transition-colors ${
          copied
            ? "bg-green-600/30 text-green-400 border border-green-500/50"
            : "bg-gray-800 border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-400"
        }`}
      >
        {copied ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function ContractFooter() {
  const goldMint = getGoldMint().toBase58();
  const programId = getProgramId().toBase58();

  return (
    <footer className="border-t border-gray-800 bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-2">
        <p className="text-xs text-gray-500">
          GOLD is a <span className="text-gray-400">Token-2022</span> mint on X1. Contract addresses below are
          <span className="text-yellow-500/90"> testnet</span> values and will be replaced at mainnet launch.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <AddressChip label="GOLD CA" address={goldMint} accent="text-yellow-400" />
          <AddressChip label="Contract CA" address={programId} accent="text-yellow-400" />
        </div>
      </div>
    </footer>
  );
}
