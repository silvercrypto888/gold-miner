#!/usr/bin/env node
// Test: call joinGame from the deployer wallet
const { PublicKey, Connection, Keypair, Transaction, TransactionInstruction, SystemProgram } = require("@solana/web3.js");
const { getOrCreateAssociatedTokenAccount, createMint, TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const RPC = "https://rpc.testnet.x1.xyz";
const PROG = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ATA_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const GM = new PublicKey("HRby9JcNp67dWCrdxwKyNohDu7WqoWmM9cbrodQCTEAq");
const BM = new PublicKey("7DVVV8f7mzXLW3pB3Xx1z9LQxVpTpNQ1Cm9NiggXDT8A");

// joinGame discriminator: sha256("global:join_game")[0..8]
// anchor uses sha256("global:join_game") = [153, 100, 85, 60, 185, 32, 148, 206]
const JOIN_DISC = Buffer.from([107, 112, 18, 38, 56, 173, 60, 128]);

async function main() {
  const dep = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(process.env.HOME, ".config/solana/id.json"), "utf-8"))));
  const wallet = dep; // use deployer wallet as player for test

  const [playerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), wallet.publicKey.toBuffer()], PROG);
  const [goldAta] = PublicKey.findProgramAddressSync(
    [wallet.publicKey.toBuffer(), T22.toBuffer(), GM.toBuffer()], ATA_PROG);

  console.log("Player wallet:", wallet.publicKey.toString());
  console.log("Player PDA:", playerPda.toString());
  console.log("GOLD ATA:", goldAta.toString());

  const conn = new Connection(RPC, "confirmed");

  // Check if player already exists
  const pInfo = await conn.getAccountInfo(playerPda);
  if (pInfo) {
    console.log("\n✓ Player already joined!");
    return;
  }

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: wallet.publicKey, blockhash, lastValidBlockHeight });

  // Accounts: wallet(signer+mut), player(mut), gold_mint(mut), player_token_account(mut),
  //           token_program, associated_token_program, system_program
  tx.add(new TransactionInstruction({
    programId: PROG,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: playerPda, isSigner: false, isWritable: true },
      { pubkey: GM, isSigner: false, isWritable: true },
      { pubkey: goldAta, isSigner: false, isWritable: true },
      { pubkey: T22, isSigner: false, isWritable: false },
      { pubkey: ATA_PROG, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: JOIN_DISC,
  }));

  console.log("\nSending joinGame...");
  const sig = await conn.sendTransaction(tx, [wallet]);
  console.log("TX:", sig);
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });

  const pi = await conn.getAccountInfo(playerPda);
  const ai = await conn.getAccountInfo(goldAta);
  console.log("\nPlayer PDA:", pi ? `${pi.data.length} bytes ✅` : "MISSING ❌");
  console.log("GOLD ATA:", ai ? `${ai.data.length} bytes ✅` : "MISSING ❌");

  // Decode player data
  if (pi) {
    const data = pi.data;
    const walletBuf = data.slice(8, 40);
    const sessionKey = data.slice(40, 72);
    const posX = data.readUInt32LE(72);
    const posY = data.readUInt32LE(76);
    const goldMined = Number(data.readBigUint64LE(80));
    const sessionExp = Number(data.readBigUint64LE(88));
    console.log("\nPlayer state:");
    console.log("  Wallet:", new PublicKey(walletBuf).toString());
    console.log("  Position:", posX, posY);
    console.log("  GOLD mined:", goldMined);
    console.log("  Session key:", new PublicKey(sessionKey).toString());
    console.log("  Session expires slot:", sessionExp);
  }
}

main().catch(e => { console.error("ERROR:", e); process.exit(1); });
