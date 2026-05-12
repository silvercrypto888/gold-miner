// Generated IDL types for Gold Miner program (Anchor 0.30 format)
import { Idl } from "@coral-xyz/anchor";

export const GoldMinerIDL: Idl = {
  address: "GoldMiner11111111111111111111111111111111111",
  metadata: {
    name: "gold_miner",
    version: "0.1.0",
    spec: "0.1.0",
    description: "Gold Miner game on X1/Solana",
  },
  instructions: [
    {
      name: "initializeGame",
      discriminator: [51, 148, 7, 60, 252, 200, 173, 131],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "gameConfig", writable: true },
        { name: "goldiumMint", writable: true },
        { name: "systemProgram" },
      ],
      args: [],
    },
    {
      name: "joinGame",
      discriminator: [234, 30, 118, 228, 25, 131, 193, 13],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
        { name: "systemProgram" },
      ],
      args: [],
    },
    {
      name: "startSession",
      discriminator: [196, 97, 248, 179, 254, 228, 84, 77],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
      ],
      args: [
        { name: "sessionKey", type: "pubkey" },
      ],
    },
    {
      name: "movePlayer",
      discriminator: [27, 160, 47, 54, 240, 70, 236, 185],
      accounts: [
        { name: "sessionSigner", signer: true },
        { name: "gameConfig", writable: true },
        { name: "player", writable: true },
        { name: "goldSpot", writable: true },
        { name: "goldiumMint", writable: true },
        { name: "playerTokenAccount", writable: true },
        { name: "tokenProgram" },
        { name: "associatedTokenProgram" },
        { name: "systemProgram" },
      ],
      args: [
        {
          name: "direction",
          type: { defined: { name: "Direction" } },
        },
      ],
    },
    {
      name: "depositXnt",
      discriminator: [149, 18, 210, 113, 239, 68, 190, 205],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
        { name: "systemProgram" },
      ],
      args: [
        { name: "amountLamports", type: "u64" },
      ],
    },
    {
      name: "withdrawXnt",
      discriminator: [107, 63, 185, 243, 217, 116, 84, 187],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
        { name: "systemProgram" },
      ],
      args: [],
    },
  ],
  accounts: [
    { name: "gameConfig", discriminator: [187, 120, 8, 3, 56, 209, 217, 208] },
    { name: "player", discriminator: [137, 8, 221, 94, 113, 192, 75, 232] },
    { name: "goldSpot", discriminator: [143, 29, 148, 114, 210, 161, 237, 43] },
  ],
  types: [
    {
      name: "Direction",
      type: {
        kind: "enum",
        variants: [
          { name: "Up" },
          { name: "Down" },
          { name: "Left" },
          { name: "Right" },
        ],
      },
    },
    {
      name: "GameConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "pubkey" },
          { name: "gridSize", type: "u16" },
          { name: "goldiumMint", type: "pubkey" },
          { name: "totalGoldMined", type: "u64" },
          { name: "moveFeeLamports", type: "u64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "Player",
      type: {
        kind: "struct",
        fields: [
          { name: "wallet", type: "pubkey" },
          { name: "sessionKey", type: "pubkey" },
          { name: "positionX", type: "u16" },
          { name: "positionY", type: "u16" },
          { name: "goldiumMinted", type: "u64" },
          { name: "sessionExpiresAt", type: "u64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "GoldSpot",
      type: {
        kind: "struct",
        fields: [
          { name: "hasGold", type: "bool" },
          { name: "minedBy", type: { option: "pubkey" } },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "InvalidSessionKey", msg: "Invalid session key" },
    { code: 6001, name: "SessionExpired", msg: "Session has expired" },
    { code: 6002, name: "OutOfBounds", msg: "Move out of bounds" },
    { code: 6003, name: "NoFundsToWithdraw", msg: "No funds to withdraw" },
    { code: 6004, name: "AlreadyMined", msg: "Position already mined" },
  ],
};

// TypeScript types matching the IDL
export interface GameConfigAccount {
  authority: string;
  gridSize: number;
  goldiumMint: string;
  totalGoldMined: string;
  moveFeeLamports: string;
  bump: number;
}

export interface PlayerAccount {
  wallet: string;
  sessionKey: string;
  positionX: number;
  positionY: number;
  goldiumMinted: string;
  sessionExpiresAt: string;
  bump: number;
}

export interface GoldSpotAccount {
  hasGold: boolean;
  minedBy: string | null;
}

export enum Direction {
  Up = "Up",
  Down = "Down",
  Left = "Left",
  Right = "Right",
}

export function directionToAnchor(direction: "up" | "down" | "left" | "right"): { up: {} } | { down: {} } | { left: {} } | { right: {} } {
  switch (direction) {
    case "up":
      return { up: {} };
    case "down":
      return { down: {} };
    case "left":
      return { left: {} };
    case "right":
      return { right: {} };
    default:
      throw new Error("Invalid direction");
  }
}