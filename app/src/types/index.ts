import { PublicKey } from "@solana/web3.js";

export interface Position {
  x: number;
  y: number;
}

export interface OtherPlayer {
  wallet: string;
  x: number;
  y: number;
}

export interface PlayerState {
  wallet: PublicKey | null;
  sessionKey: PublicKey | null;
  position: Position;
  goldiumMinted: number;
  sessionExpiresAt: number;
  escrowBalance: number;
}

export interface GoldSpot {
  x: number;
  y: number;
  hasGold: boolean;
  minedBy?: PublicKey | null;
}

export interface GameConfig {
  authority: PublicKey;
  gridSize: number;
  goldiumMint: PublicKey;
  totalGoldMined: number;
  moveFeeLamports: number;
}

export interface LeaderboardEntry {
  wallet: string;
  goldiumMinted: number;
  position: Position;
}

export enum Direction {
  Up = "Up",
  Down = "Down",
  Left = "Left",
  Right = "Right",
}

export interface SessionKeyData {
  publicKey: string;
  // Encrypted storage: secretKey is ciphertext, real key is inside AES-GCM
  secretKey: string;
  iv: string;
  expirySlot: number;
}

// IDL Types (matching Anchor program)
export interface GoldMinerIDL {
  version: string;
  name: string;
  instructions: any[];
  accounts: any[];
  types: any[];
  errors: any[];
}