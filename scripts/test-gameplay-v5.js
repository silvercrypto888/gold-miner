#!/usr/bin/env node
const {
  Connection, Keypair, PublicKey, Transaction,
  TransactionInstruction, SystemProgram, ComputeBudgetProgram
} = require("@solana/web3.js");
const {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  getMint,
} = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const RPC = "https://x1-testnet.xen.network";
const PROG = new PublicKey("4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM");
const GOLD_MINT = new PublicKey("FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX");
const GOLD_BITMAP = new PublicKey("HaphYcxXYfPbUCppeYkDNpVTZhdGcwbPQonwx7kTjzK5");
const T22 = TOKEN_2022_PROGRAM_ID;
const ATA_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Discriminators
const JOIN_DISC = Buffer.from([107, 112, 18, 38, 56, 173, 60, 128]);
const START_SESSION_DISC = Buffer.from([23, 227, 111, 142, 212, 230, 3, 175]);
const MOVE_DISC = Buffer.from([26, 202, 228, 63, 206, 4, 137, 63]);

const DIRECTION_RIGHT = Buffer.from([3]);

async function main() {
  const dep = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(process.env.HOME, ".config/solana/id.json"), "utf-8"))));

  const conn = new Connection(RPC, "confirmed");

  // Generate a test player wallet
  const player = Keypair.generate();
  console.log("=== Player wallet:", player.publicKey.toBase58());

  // Fund player with some SOL
  console.log("Funding player with 0.05 SOL...");
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: dep.publicKey,
      toPubkey: player.publicKey,
      lamports: 50_000_000,
    })
  );
  const fundSig = await conn.sendTransaction(fundTx, [dep]);
  await conn.confirmTransaction(fundSig);
  console.log("  Funded:", fundSig);

  // Derive PDAs
  const [gameConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("silver_config_v2")], PROG);
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), gameConfigPda.toBuffer()], PROG);
  const [playerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), player.publicKey.toBuffer()], PROG);

  const playerGoldAta = getAssociatedTokenAddressSync(GOLD_MINT, player.publicKey, false, T22);
  const treasuryGoldAta = getAssociatedTokenAddressSync(GOLD_MINT, treasuryPda, true, T22);

  console.log("\n=== Addresses ===");
  console.log("GameConfig:", gameConfigPda.toBase58());
  console.log("Bitmap:", GOLD_BITMAP.toBase58());
  console.log("Treasury:", treasuryPda.toBase58());
  console.log("Player PDA:", playerPda.toBase58());
  console.log("Player GOLD ATA:", playerGoldAta.toBase58());
  console.log("Treasury GOLD ATA:", treasuryGoldAta.toBase58());

  // Check mint authority
  const mintInfo = await getMint(conn, GOLD_MINT, "confirmed", T22);
  console.log("\nMint authority:", mintInfo.mintAuthority?.toBase58() || "null");

  // Create player GOLD ATA if needed
  const playerAtaInfo = await conn.getAccountInfo(playerGoldAta);
  if (!playerAtaInfo) {
    console.log("\nCreating player GOLD ATA...");
    const createAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        dep.publicKey, playerGoldAta, player.publicKey, GOLD_MINT, T22
      )
    );
    const ataSig = await conn.sendTransaction(createAtaTx, [dep]);
    await conn.confirmTransaction(ataSig);
    console.log("  Created:", ataSig);
  }

  // Create treasury GOLD ATA if needed
  const treasuryGoldAtaInfo = await conn.getAccountInfo(treasuryGoldAta);
  if (!treasuryGoldAtaInfo) {
    console.log("\nCreating treasury GOLD ATA...");
    const createTreasuryAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        dep.publicKey, treasuryGoldAta, treasuryPda, GOLD_MINT, T22
      )
    );
    const treasAtaSig = await conn.sendTransaction(createTreasuryAtaTx, [dep]);
    await conn.confirmTransaction(treasAtaSig);
    console.log("  Created treasury ATA:", treasAtaSig);
  }

  // === TEST 1: joinGame ===
  console.log("\n=== TEST 1: joinGame ===");
  const joinTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    new TransactionInstruction({
      keys: [
        { pubkey: player.publicKey, isSigner: true, isWritable: true },
        { pubkey: playerPda, isSigner: false, isWritable: true },
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },
        { pubkey: GOLD_MINT, isSigner: false, isWritable: true },
        { pubkey: playerGoldAta, isSigner: false, isWritable: true },
        { pubkey: T22, isSigner: false, isWritable: false },
        { pubkey: ATA_PROG, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROG,
      data: JOIN_DISC,
    })
  );

  try {
    const joinSig = await conn.sendTransaction(joinTx, [player]);
    await conn.confirmTransaction(joinSig);
    console.log("  ✅ joinGame TX:", joinSig);
  } catch (e) {
    console.log("  ❌ joinGame failed:", e.message);
    if (e.transactionLogs) {
      console.log("  Logs:", e.transactionLogs.slice(-5).join("\n  "));
    }
  }

  // Check player account
  const playerInfo = await conn.getAccountInfo(playerPda);
  if (playerInfo) {
    console.log("  Player account:", playerInfo.data.length, "bytes");
    const pd = playerInfo.data;
    const pWallet = new PublicKey(pd.slice(8, 40));
    const pSession = new PublicKey(pd.slice(40, 72));
    const pX = pd.readUInt32LE(72);
    const pY = pd.readUInt32LE(76);
    const pGold = pd.readBigUInt64LE(80);
    const pExpires = pd.readBigUInt64LE(88);
    const pBump = pd[96];
    console.log("  Decoded:");
    console.log("    wallet:", pWallet.toBase58());
    console.log("    sessionKey:", pSession.toBase58());
    console.log("    position: (", pX, ",", pY, ")");
    console.log("    goldiumMinted:", pGold.toString());
    console.log("    sessionExpiresAt:", pExpires.toString());
    console.log("    bump:", pBump);
  } else {
    console.log("  Player account NOT found");
  }

  // === TEST 2: startSession ===
  console.log("\n=== TEST 2: startSession ===");
  const sessionKey = Keypair.generate();
  const sessionData = Buffer.concat([START_SESSION_DISC, sessionKey.publicKey.toBuffer()]);

  const startTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    new TransactionInstruction({
      keys: [
        { pubkey: player.publicKey, isSigner: true, isWritable: true },
        { pubkey: playerPda, isSigner: false, isWritable: true },
      ],
      programId: PROG,
      data: sessionData,
    })
  );

  try {
    const startSig = await conn.sendTransaction(startTx, [player]);
    await conn.confirmTransaction(startSig);
    console.log("  ✅ startSession TX:", startSig);
  } catch (e) {
    console.log("  ❌ startSession failed:", e.message);
    if (e.transactionLogs) {
      console.log("  Logs:", e.transactionLogs.slice(-5).join("\n  "));
    }
  }

  // Re-check player
  const playerInfo2 = await conn.getAccountInfo(playerPda);
  if (playerInfo2) {
    const pd2 = playerInfo2.data;
    const pSession2 = new PublicKey(pd2.slice(40, 72));
    const pExpires2 = pd2.readBigUInt64LE(88);
    console.log("  Session key:", pSession2.toBase58());
    console.log("  Session expires:", pExpires2.toString());
  }

  // Fund session key
  console.log("\nFunding session key with 0.01 SOL...");
  const fundSessionTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: dep.publicKey,
      toPubkey: sessionKey.publicKey,
      lamports: 10_000_000,
    })
  );
  const fundSessionSig = await conn.sendTransaction(fundSessionTx, [dep]);
  await conn.confirmTransaction(fundSessionSig);
  console.log("  Funded session key:", fundSessionSig);

  // === TEST 3: moveAndMine ===
  console.log("\n=== TEST 3: moveAndMine (Right) ===");
  const moveData = Buffer.concat([MOVE_DISC, DIRECTION_RIGHT]);

  const moveTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    new TransactionInstruction({
      keys: [
        { pubkey: sessionKey.publicKey, isSigner: true, isWritable: false },
        { pubkey: playerPda, isSigner: false, isWritable: true },
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },
        { pubkey: GOLD_BITMAP, isSigner: false, isWritable: true },
        { pubkey: GOLD_MINT, isSigner: false, isWritable: true },
        { pubkey: playerGoldAta, isSigner: false, isWritable: true },
        { pubkey: treasuryPda, isSigner: false, isWritable: true },
        { pubkey: treasuryGoldAta, isSigner: false, isWritable: true },
        { pubkey: T22, isSigner: false, isWritable: false },
        { pubkey: ATA_PROG, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROG,
      data: moveData,
    })
  );

  try {
    const moveSig = await conn.sendTransaction(moveTx, [sessionKey]);
    await conn.confirmTransaction(moveSig);
    console.log("  ✅ moveAndMine TX:", moveSig);
  } catch (e) {
    console.log("  ❌ moveAndMine failed:", e.message);
    if (e.transactionLogs) {
      console.log("  Logs:", e.transactionLogs.slice(-8).join("\n  "));
    }
  }

  // Final player state
  const playerInfo3 = await conn.getAccountInfo(playerPda);
  if (playerInfo3) {
    const pd3 = playerInfo3.data;
    const pX3 = pd3.readUInt32LE(72);
    const pY3 = pd3.readUInt32LE(76);
    const pGold3 = pd3.readBigUInt64LE(80);
    console.log("\n=== Final Player State ===");
    console.log("  Position: (", pX3, ",", pY3, ")");
    console.log("  Goldium minted:", pGold3.toString());
  }

  console.log("\n✅ All tests complete!");
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
