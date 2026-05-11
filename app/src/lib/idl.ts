// Generated IDL types for Gold Miner program
import { Idl } from "@coral-xyz/anchor";

export const GoldMinerIDL: Idl = {
  version: "0.1.0",
  name: "gold_miner",
  instructions: [
    {
      name: "initializeGame",
      accounts: [
        { name: "authority", isMut: true, isSigner: true },
        { name: "gameConfig", isMut: true, isSigner: false },
        { name: "goldiumMint", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "joinGame",
      accounts: [
        { name: "wallet", isMut: true, isSigner: true },
        { name: "player", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "startSession",
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
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "publicKey" },
          { name: "gridSize", type: "u16" },
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
          { name: "minedBy", type: { option: "publicKey" } },
        ],
      },
    },
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