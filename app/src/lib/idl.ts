// Generated IDL for Gold Miner program — Anchor v0.30 format
import { Idl } from "@coral-xyz/anchor";

export const GoldMinerIDL: Idl = {
  address: "EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf",
  metadata: {
    name: "gold_miner",
    version: "0.1.0",
    spec: "0.1.0",
    description: "Gold Miner game on X1/Solana",
  },
  instructions: [
    {
      name: "initializeGame",
      discriminator: [44, 62, 102, 247, 126, 208, 130, 215],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "gameConfig", writable: true },
        { name: "goldiumMint", writable: true },
        { name: "tokenProgram", address: "TokenzQgBNY1bUK1n5T2Q6Q6WKFk5CQu9upH5hF9jQ" },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "joinGame",
      discriminator: [107, 112, 18, 38, 56, 173, 60, 128],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "startSession",
      discriminator: [23, 227, 111, 142, 212, 230, 3, 175],
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
      discriminator: [17, 58, 68, 221, 186, 117, 140, 231],
      accounts: [
        { name: "sessionSigner", signer: true },
        { name: "gameConfig", writable: true },
        { name: "player", writable: true },
        { name: "goldSpot", writable: true },
        { name: "goldiumMint", writable: true },
        { name: "playerTokenAccount", writable: true },
        { name: "tokenProgram", address: "TokenzQgBNY1bUK1n5T2Q6Q6WKFk5CQu9upH5hF9jQ" },
        { name: "associatedTokenProgram", address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
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
      discriminator: [174, 84, 153, 146, 93, 0, 115, 244],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "amountLamports", type: "u64" },
      ],
    },
    {
      name: "withdrawXnt",
      discriminator: [129, 188, 47, 92, 90, 169, 6, 251],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
        { name: "systemProgram", address: "11111111111111111111111111" },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "GameConfig",
      discriminator: [45, 146, 146, 33, 170, 69, 96, 133],
    },
    {
      name: "Player",
      discriminator: [205, 222, 112, 7, 165, 155, 206, 218],
    },
    {
      name: "GoldSpot",
      discriminator: [112, 156, 149, 108, 70, 90, 135, 242],
    },
  ],
  types: [
    {
      name: "GameConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "pubkey" },
          { name: "gridSize", type: "u32" },
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
          { name: "positionX", type: "u32" },
          { name: "positionY", type: "u32" },
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

export type Direction = "Up" | "Down" | "Left" | "Right";

export function directionToAnchor(direction: Direction): Record<string, {}> {
  return { [direction]: {} };
}