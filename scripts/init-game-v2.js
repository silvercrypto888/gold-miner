#!/usr/bin/env node
const {
  Connection, Keypair, PublicKey, Transaction,
  TransactionInstruction, SystemProgram
} = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const RPC = "https://x1-testnet.xen.network";
const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const PROG = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
// initialize_game discriminator (anchor)
const DIS = Buffer.from([44, 62, 102, 247, 126, 208, 130, 215]);

async function main() {
  const dep = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(process.env.HOME, ".config/solana/id.json"), "utf-8"))));

  // New game_config PDA with seed 'game_config_v2'
  const [cfg] = PublicKey.findProgramAddressSync([Buffer.from("game_config_v2")], PROG);

  // Existing bitmap keypair
  const bmKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "../gold-bitmap-keypair.json"), "utf-8"))));

  // Load new GOLD mint
  const mintInfo = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "gold-mint-v3-info.json"), "utf-8"));
  const goldMint = new PublicKey(mintInfo.mint);

  console.log("Deployer:", dep.publicKey.toBase58());
  console.log("New game_config_v2 PDA:", cfg.toBase58());
  console.log("Reusing bitmap:", bmKp.publicKey.toBase58());
  console.log("GOLD mint:", goldMint.toBase58());

  const conn = new Connection(RPC, "confirmed");

  // Check if already initialized
  const ex = await conn.getAccountInfo(cfg);
  if (ex) { console.log("\n✅ game_config_v2 already initialized!"); return; }

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: dep.publicKey, blockhash, lastValidBlockHeight });

  // Call initialize_game
  tx.add(new TransactionInstruction({
    programId: PROG,
    keys: [
      { pubkey: dep.publicKey, isSigner: true, isWritable: true },
      { pubkey: cfg, isSigner: false, isWritable: true },
      { pubkey: bmKp.publicKey, isSigner: false, isWritable: true },
      { pubkey: goldMint, isSigner: false, isWritable: true },
      { pubkey: T22, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DIS,
  }));

  console.log("Sending initialize_game...");
  const sig = await conn.sendTransaction(tx, [dep]);
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  console.log("✅ Initialized:", sig);

  const ci = await conn.getAccountInfo(cfg);
  if (ci) console.log("✓ GameConfig:", ci.data.length, "bytes");

  // Verify stored values
  if (ci && ci.data.length >= 96) {
    const authority = new PublicKey(ci.data.slice(0, 32));
    const storedMint = new PublicKey(ci.data.slice(32, 64));
    const storedBitmap = new PublicKey(ci.data.slice(64, 96));
    console.log("\nStored values:");
    console.log("  authority:", authority.toBase58());
    console.log("  gold_mint:", storedMint.toBase58());
    console.log("  gold_bitmap:", storedBitmap.toBase58());
    console.log("  Match GOLD?", storedMint.equals(goldMint) ? "✅" : "❌");
    console.log("  Match bitmap?", storedBitmap.equals(bmKp.publicKey) ? "✅" : "❌");
  }

  console.log("\n--- UPDATE YOUR .env.local ---");
  console.log(`NEXT_PUBLIC_PROGRAM_ID=${PROG.toString()}`);
  console.log(`NEXT_PUBLIC_GOLD_MINT=${goldMint.toString()}`);
  console.log(`NEXT_PUBLIC_GOLD_BITMAP=${bmKp.publicKey.toString()}`);
}

main().catch(e => { console.error(e); process.exit(1); });
