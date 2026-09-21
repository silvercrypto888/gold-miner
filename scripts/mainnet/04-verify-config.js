#!/usr/bin/env node
/**
 * Gold Miner v2 — Read/verify MAINNET GameConfig + Treasury + bitmap.
 * Usage: node scripts/mainnet/04-verify-config.js
 */
const Web3 = require("@solana/web3.js");
const { PublicKey, Connection, Keypair } = Web3;
const path = require("path");
const fs = require("fs");

// Load the mainnet program keypair (plain 64-int array) → derive program ID.
const arr = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "../../target/deploy/gold_miner_mainnet-keypair.json"), "utf8"));
const PROG = (Array.isArray(arr) && arr.length === 64)
  ? Keypair.fromSecretKey(Uint8Array.from(arr)).publicKey
  : new PublicKey("DZ4FErNjFdqFMumiYpTLtdKh5a1mqREhYFpQPr6XiJcP");

const RPC = "https://rpc.mainnet.x1.xyz";

async function readCfg() {
  const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from("silver_config_v2")], PROG);
  console.log("Program       :", PROG.toBase58());
  console.log("GameConfig PDA:", pda.toBase58(), "bump:", bump);

  const conn = new Connection(RPC, "confirmed");
  const info = await conn.getAccountInfo(pda);
  if (!info) { console.log("→ no GameConfig account yet (run init)."); return; }
  const d = info.data;
  console.log("len:", d.length, "owner:", info.owner.toBase58());
  console.log("authority  :", new PublicKey(d.slice(8, 40)).toBase58());
  console.log("grid_size  :", d.readUInt32LE(40));
  console.log("gold_mint  :", new PublicKey(d.slice(44, 76)).toBase58());
  console.log("bitmap     :", new PublicKey(d.slice(76, 108)).toBase58());
  console.log("total_mined:", d.readBigUInt64LE(108).toString());
  console.log("immutable  :", d[117]);

  // Treasury
  const [treasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), pda.toBuffer()], PROG);
  console.log("\nTreasury PDA:", treasury.toBase58());
  const ti = await conn.getAccountInfo(treasury);
  if (ti) {
    const t = ti.data;
    console.log("  game_config:", new PublicKey(t.slice(8, 40)).toBase58());
    console.log("  gold_accum :", t.readBigUInt64LE(40).toString());
    console.log("  xnt_accum  :", t.readBigUInt64LE(48).toString());
    console.log("  lp_burned  :", t.readBigUInt64LE(56).toString());
  } else {
    console.log("  → no Treasury yet (run init_treasury).");
  }
}

readCfg().catch(e => { console.error(e); process.exit(1); });
