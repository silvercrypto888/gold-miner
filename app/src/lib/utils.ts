import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import bs58 from "bs58";
import { SessionKeyData } from "@/types";
import { SESSION_KEY_STORAGE, LAMPORTS_PER_SOL } from "./constants";

// Generate a new session keypair
export function generateSessionKeypair(): nacl.SignKeyPair {
  return nacl.sign.keyPair();
}

// Store session key in localStorage
export function storeSessionKey(keypair: nacl.SignKeyPair, expiresAt: number): void {
  if (typeof window === "undefined") return;
  
  const data: SessionKeyData = {
    publicKey: bs58.encode(keypair.publicKey),
    secretKey: bs58.encode(keypair.secretKey),
    expiresAt,
  };
  
  localStorage.setItem(SESSION_KEY_STORAGE, JSON.stringify(data));
}

// Load session key from localStorage
export function loadSessionKey(): { keypair: nacl.SignKeyPair; expiresAt: number } | null {
  if (typeof window === "undefined") return null;
  
  const stored = localStorage.getItem(SESSION_KEY_STORAGE);
  if (!stored) return null;
  
  try {
    const data: SessionKeyData = JSON.parse(stored);
    
    // Check if expired
    if (Date.now() > data.expiresAt) {
      clearSessionKey();
      return null;
    }
    
    const keypair: nacl.SignKeyPair = {
      publicKey: bs58.decode(data.publicKey),
      secretKey: bs58.decode(data.secretKey),
    };
    
    return { keypair, expiresAt: data.expiresAt };
  } catch (e) {
    clearSessionKey();
    return null;
  }
}

// Clear session key from localStorage
export function clearSessionKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY_STORAGE);
}

// Sign a message with session key
export function signWithSessionKey(keypair: nacl.SignKeyPair, message: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, keypair.secretKey);
}

// Get session key public key as PublicKey
export function getSessionPublicKey(keypair: nacl.SignKeyPair): PublicKey {
  return new PublicKey(keypair.publicKey);
}

// Debounce function for key presses
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function for movement
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Calculate distance between two positions
export function getDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Interpolate position for smooth animation
export function interpolatePosition(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  progress: number
): { x: number; y: number } {
  return {
    x: startX + (endX - startX) * progress,
    y: startY + (endY - startY) * progress,
  };
}

// Validate wallet address
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// Shorten wallet address for display
export function shortenAddress(address: string, chars: number = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Format goldium amount for display
export function formatGoldium(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Convert PublicKey to Buffer for PDA
export function publicKeyToBuffer(pk: PublicKey): Buffer {
  return pk.toBuffer();
}

// Create a deposit transaction
export function createDepositTransaction(
  playerPda: PublicKey,
  amountXNT: number
): Transaction {
  const transaction = new Transaction();
  
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: playerPda, // This will be replaced with actual wallet
      toPubkey: playerPda,
      lamports: amountXNT * LAMPORTS_PER_SOL,
    })
  );
  
  return transaction;
}

// Format timestamp to readable date
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

// Calculate time remaining
export function getTimeRemaining(endTime: number): string {
  const now = Date.now();
  const diff = endTime - now;
  
  if (diff <= 0) return "Expired";
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
}