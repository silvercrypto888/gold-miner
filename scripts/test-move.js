#!/usr/bin/env node
// Test: session key + move_and_mine
const { PublicKey, Connection, Keypair, Transaction, TransactionInstruction, SystemProgram } = require("@solana/web3.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RPC = "https://rpc.testnet.x1.xyz";
const PROG = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ATA_PROG = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const GM = new PublicKey("HRby9JcNp67dWCrdxwKyNohDu7WqoWmM9cbrodQCTEAq");
const BM = new PublicKey("7DVVV8f7mzXLW3pB3Xx1z9LQxVpTpNQ1Cm9NiggXDT8A");

const SESSION_DISC = Buffer.from([23, 227, 111, 142, 212, 230, 3, 175]);
const MOVE_DISC = Buffer.from([26, 202, 228, 63, 206, 4, 137, 63]);

async function main() {
  const dep = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(process.env.HOME, ".config/solana/id.json"), "utf-8"))));
  const wallet = dep;

  const [playerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), wallet.publicKey.toBuffer()], PROG);
  const [goldAta] = PublicKey.findProgramAddressSync(
    [wallet.publicKey.toBuffer(), T22.toBuffer(), GM.toBuffer()], ATA_PROG);

  const conn = new Connection(RPC, "confirmed");

  // Step 1: Create session key
  const sessionKp = Keypair.generate();
  console.log("Session key:", sessionKp.publicKey.toString());

  // start_session data: discriminator(8) + pubkey(32)
  const startData = Buffer.concat([SESSION_DISC, sessionKp.publicKey.toBytes()]);

  let { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  let tx = new Transaction({ feePayer: wallet.publicKey, blockhash, lastValidBlockHeight });
  tx.add(new TransactionInstruction({
    programId: PROG,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: playerPda, isSigner: false, isWritable: true },
    ],
    data: startData,
  }));

  console.log("\nStarting session...");
  let sig = await conn.sendTransaction(tx, [wallet]);
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  console.log("Session tx:", sig);

  // Step 2: Move right (Direction::Right = 3 in enum)
  // move_and_mine data: discriminator(8) + variant(1) — 0=Up, 1=Down, 2=Left, 3=Right
  const moveData = Buffer.concat([MOVE_DISC, Buffer.from([3])]); // Right=3

  ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash());
  tx = new Transaction({ feePayer: wallet.publicKey, blockhash, lastValidBlockHeight });
  tx.add(new TransactionInstruction({
    programId: PROG,
    keys: [
      { pubkey: sessionKp.publicKey, isSigner: true, isWritable: false },
      { pubkey: playerPda, isSigner: false, isWritable: true },
      { pubkey: PublicKey.findProgramAddressSync([Buffer.from("game_config")], PROG)[0], isSigner: false, isWritable: true },
      { pubkey: BM, isSigner: false, isWritable: true },
      { pubkey: GM, isSigner: false, isWritable: true },
      { pubkey: goldAta, isSigner: false, isWritable: true },
      { pubkey: T22, isSigner: false, isWritable: false },
      { pubkey: ATA_PROG, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: moveData,
  }));

  console.log("\nMoving right...");
  sig = await conn.sendTransaction(tx, [wallet, sessionKp]);
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  console.log("Move tx:", sig);

  // Read player state
  const pi = await conn.getAccountInfo(playerPda);
  if (pi) {
    const posX = pi.data.readUInt32LE(72);
    const posY = pi.data.readUInt32LE(76);
    const gold = Number(pi.data.readBigUint64LE(80));
    console.log("\nPlayer state after move:");
    console.log("  Position:", posX, posY);
    console.log("  GOLD mined:", gold);
  }

  // Read bitmap at position (2,1) - (2 & 1) % 7 = 0, so gold at (2,1)
  const bmInfo = await conn.getAccountInfo(BM);
  if (bmInfo) {
    const bitIdx = (1-1) * 1024 + (2-1); // y=1,x=2
    const byteIdx = Math.floor(bitIdx / 8);
    const bitPos = bitIdx % 8;
    const mined = (bmInfo.data[byteIdx] & (1 << bitPos)) !== 0;
    console.log("  Mined at (2,1):", mined ? "YES ✅" : "NO ❌");
  }

  // Read GOLD ATA balance
  try {
    const tokens = await conn.getTokenAccountBalance(goldAta);
    console.log("  GOLD balance:", tokens.value.uiAmountString);
  } catch(e) {
    console.log("  GOLD balance lookup:", e.message);
  }
}

main().catch(e => { console.error("ERROR:", e); process.exit(1); });
