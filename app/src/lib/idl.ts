// Generated IDL types for Gold Miner program
// Anchor v0.30 format with explicit discriminators
import { Idl } from "@coral-xyz/anchor";

export const GoldMinerIDL: Idl = {
  version: "0.1.0",
  name: "gold_miner",
  instructions: [
    {
      name: "initializeGame",
      discriminator: [44, 62, 102, 247, 126, 208, 130, 215],
      accounts: [
        { name: "authority", isMut: true, isSigner: true },
        { name: "gameConfig", isMut: true, isSigner: false },
        { name: "goldiumMint", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "joinGame",
      discriminator: [107, 112, 18, 38, 56, 173, 60, 128],
      accounts: [
        { name: "wallet", isMut: true, isSigner: true },
        { name: "player", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "startSession",
      discriminator: [23, 227, 111, 142, 212, 230, 3, 175],
      accounts: [
        { name: "wallet", isMut: true, isSigner: true },
        { name: "player", isMut: true, isSigner: false },
      ],
      args: [
        { name: "sessionKey", type: "publicKey" },
      ],
    },
    {
      name: "movePlayer",
      discriminator: [17, 58, 68, 221, 186, 117, 140, 231],
      accounts: [
        { name: "sessionSigner", isMut: false, isSigner: true },
        { name: "gameConfig", isMut: true, isSigner: false },
        { name: "player", isMut: true, isSigner: false },
        { name: "goldSpot", isMut: true, isSigner: false },
        { name: "goldiumMint", isMut: true, isSigner: false },
        { name: "playerTokenAccount", isMut: true, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
        { name: "associatedTokenProgram", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        {
          name: "direction",
          type: {
            defined: "Direction",
          },
        },
      ],
    },
    {
      name: "depositXnt",
      discriminator: [174, 84, 153, 146, 93, 0, 115, 244],
      accounts: [
        { name: "wallet", isMut: true, isSigner: true },
        { name: "player", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "amountLamports", type: "u64" },
      ],
    },
    {
      name: "withdrawXnt",
      discriminator: [129, 188, 47, 92, 90, 169, 6, 251],
      accounts: [
        { name: "wallet", isMut: true, isSigner: true },
        { name: "player", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
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
          { name: "authority", type: "publicKey" },
          { name: "gridSize", type: "u32" },
          { name: "goldiumMint", type: "publicKey" },
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
          { name: "wallet", type: "publicKey" },
          { name: "sessionKey", type: "publicKey" },
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
          { name: "minedBy", type: { option: "publicKey" } },
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

export enum Direction {
  Up = { up: {} },
  Down = { down: {} },
  Left = { left: {} },
  Right = { right: {} },
}

export function directionToAnchor(direction: "up" | "down" | "left" | "right"): object {
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