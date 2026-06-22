// Gold Miner v2 IDL — Bitmap Architecture (Anchor v0.30 format)
// Generated program ID: GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6
import { Idl } from "@coral-xyz/anchor";

export const GoldMinerIDL: Idl = {
  address: "GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6",
  metadata: {
    name: "gold_miner",
    version: "0.2.0",
    spec: "0.1.0",
    description: "Gold Miner v2 - Bitmap grid game on X1",
  },
  instructions: [
    {
      name: "initializeGame",
      discriminator: [44, 62, 102, 247, 126, 208, 130, 215],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "gameConfig", writable: true },
        { name: "goldBitmap", writable: true },
        { name: "goldMint", writable: true },
        { name: "tokenProgram", address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "initTreasury",
      discriminator: [105, 152, 173, 51, 158, 151, 49, 14],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "gameConfig", writable: true },
        { name: "treasury", writable: true },
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
        { name: "goldMint", writable: true },
        { name: "playerTokenAccount", writable: true },
        { name: "tokenProgram", address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
        { name: "associatedTokenProgram", address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" },
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
      name: "moveAndMine",
      discriminator: [26, 202, 228, 63, 206, 4, 137, 63],
      accounts: [
        { name: "sessionSigner", signer: true },
        { name: "player", writable: true },
        { name: "gameConfig", writable: true },
        { name: "goldBitmap", writable: true },
        { name: "goldMint", writable: true },
        { name: "playerTokenAccount", writable: true },
        { name: "treasury", writable: true },
        { name: "treasuryTokenAccount", writable: true },
        { name: "tokenProgram", address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
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
      name: "treasuryAutoLp",
      discriminator: [88, 214, 22, 127, 104, 230, 169, 225],
      accounts: [
        { name: "authority", signer: true },
        { name: "gameConfig", writable: true },
        { name: "treasury", writable: true },
        { name: "ammProgram" },
        { name: "marketAuthority" },
        { name: "ammConfig" },
        { name: "poolState" },
        { name: "goldVault" },
        { name: "xntVault" },
        { name: "observerState" },
        { name: "treasuryGoldAta", writable: true },
        { name: "treasuryXntAta", writable: true },
        { name: "treasuryLpAta", writable: true },
        { name: "goldMint" },
        { name: "xntMint" },
        { name: "lpMint" },
        { name: "goldTokenProg" },
        { name: "xntTokenProg" },
        { name: "lpTokenProg" },
        { name: "incineratorAta", writable: true },
        { name: "associatedTokenProgram" },
        { name: "systemProgram" },
      ],
      args: [],
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
        { name: "systemProgram", address: "11111111111111111111111111111111" },
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
      name: "Treasury",
      discriminator: [238, 239, 123, 238, 89, 1, 168, 253],
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
          { name: "goldMint", type: "pubkey" },
          { name: "totalGoldMined", type: "u64" },
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
      name: "Treasury",
      type: {
        kind: "struct",
        fields: [
          { name: "gameConfig", type: "pubkey" },
          { name: "goldAccumulated", type: "u64" },
          { name: "xntAccumulated", type: "u64" },
          { name: "lpBurned", type: "u64" },
          { name: "bump", type: "u8" },
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
    { code: 6004, name: "ArithmeticError", msg: "Arithmetic error" },
    { code: 6005, name: "AlreadyMined", msg: "Position already mined" },
    { code: 6006, name: "NoGoldHere", msg: "No gold at this position" },
    { code: 6007, name: "InsufficientGoldForLp", msg: "Insufficient GOLD in treasury for LP" },
    { code: 6008, name: "InsufficientLpMinted", msg: "Insufficient LP tokens minted" },
  ],
};

// TypeScript types matching the IDL
export interface GameConfigAccount {
  authority: string;
  gridSize: number;
  goldMint: string;
  totalGoldMined: string;
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

export interface TreasuryAccount {
  gameConfig: string;
  goldAccumulated: string;
  xntAccumulated: string;
  lpBurned: string;
  bump: number;
}
