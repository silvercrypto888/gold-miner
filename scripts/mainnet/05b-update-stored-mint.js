#!/usr/bin/env node
/**
 * Gold Miner v2 — MAINNET: point the GameConfig account at the NEW mint (with metadata).
 *
 * Reads the current mint from gold-mint-mainnet-info.json and, only if the GameConfig
 * account still stores the OLD mint, sends update_gold_mint to swap it to the new one.
 * Uses RAW TransactionInstruction with hardcoded discriminator (proven pattern).
 *
 * Discriminator (sha256("global:update_gold_mint")[0..8]):
 *   f0ee5f4af1f18075 = [240,238,95,74,241,241,128,117]
 */
const path = require("path");
const fs = require("fs");
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require("@solana/web3.js");

const RPC = "https://rpc.mainnet.x1.xyz";
const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const DEPLOYER = path.resolve(__dirname, "../../../secure/gold-miner-mainnet/deployer-mainnet.json");
const PROG_ARR = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../target/deploy/gold_miner_mainnet-keypair.json"), "utf8"));
const DIS_UPDATE = Buffer.from([240, 238, 95, 74, 241, 241, 128, 117]);

async function main() {
  const info = JSON.parse(fs.readFileSync(path.resolve(__dirname, "gold-mint-mainnet-info.json"), "utf8"));
  const newMint = new PublicKey(info.mint);
  const oldMintRaw = info.replacedOldMint;

  const conn = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(DEPLOYER, "utf8"))));
  const PROG = Keypair.fromSecretKey(Uint8Array.from(PROG_ARR)).publicKey;
  const [cfgPda] = PublicKey.findProgramAddressSync([Buffer.from("silver_config_v2")], PROG);

  console.log("Network        :", RPC);
  console.log("Deployer       :", payer.publicKey.toBase58());
  console.log("Program        :", PROG.toBase58());
  console.log("GameConfig PDA :", cfgPda.toBase58());
  console.log("New mint       :", newMint.toBase58());
  console.log("Old mint (was) :", oldMintRaw || "(unknown)");

  const ci = await conn.getAccountInfo(cfgPda);
  if (!ci) { console.error("❌ GameConfig PDA not found — abort."); process.exit(1); }
  const storedMint = new PublicKey(ci.data.slice(44, 76)).toBase58();
  console.log("Stored mint    :", storedMint);

  if (storedMint === newMint.toBase58()) {
    console.log("\n✅ GameConfig already stores the new mint — nothing to do.");
    return;
  }

  console.log("\n>>> update_gold_mint → " + newMint.toBase58() + " (was " + storedMint + ")");
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight });
  tx.add(new TransactionInstruction({
    programId: PROG,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: cfgPda, isSigner: false, isWritable: true },
      { pubkey: newMint, isSigner: false, isWritable: true },
      { pubkey: T22, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DIS_UPDATE,
  }));
  const sig = await conn.sendTransaction(tx, [payer], { skipPreflight: false, preflightCommitment: "confirmed" });
  await conn.confirmTransaction(sig, "confirmed");
  console.log("✅ update_gold_mint:", sig);

  // verify
  const ci2 = await conn.getAccountInfo(cfgPda);
  const stored2 = new PublicKey(ci2.data.slice(44, 76)).toBase58();
  console.log("\nStored mint now:", stored2);
  console.log("Matches new    :", stored2 === newMint.toBase58() ? "✅" : "❌");
}

main().catch((e) => { console.error(e); process.exit(1); });
