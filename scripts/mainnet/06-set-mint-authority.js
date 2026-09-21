#!/usr/bin/env node
/**
 * Gold Miner v2 — MAINNET: transfer mint authority → GameConfig PDA (NO pre-mine).
 *
 * Per the litepaper: "Tokens are minted exclusively through gameplay. There is no
 * pre-mine, no airdrop, no founder allocation. The only source of new GOLD is
 * mining gold spots on the grid."  →  THIS SCRIPT MINTS NOTHING.
 *
 * It ONLY transfers mint authority from the deployer to the GameConfig PDA:
 *   The mining + treasury CPIs sign as the GameConfig PDA (seeds [b"silver_config_v2",
 *   bump] on the deployed program), so mint authority MUST be that PDA, not the
 *   deployer, or in-game minting reverts.
 *
 * Ordering:
 *   1) 01-deploy-program.sh
 *   2) 02-create-gold-mint.js      (mint has deployer as authority initially)
 *   3) 05-init-game.js             (creates GameConfig + Treasury PDAs; update_gold_mint)
 *   4) THIS SCRIPT                 (authority → GameConfig PDA only)
 *
 * Usage: node scripts/mainnet/06-set-mint-authority.js
 */
const path = require("path");
const fs = require("fs");
const {
  Connection, Keypair, PublicKey, Transaction,
} = require("@solana/web3.js");
const {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  AuthorityType,
  createSetAuthorityInstruction,
} = require("@solana/spl-token");

const RPC = "https://rpc.mainnet.x1.xyz";
const DEPLOYER = path.resolve(
  __dirname, "../../../secure/gold-miner-mainnet/deployer-mainnet.json");
const PROG_ARR = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "../../target/deploy/gold_miner_mainnet-keypair.json"), "utf8"));
const MINT_INFO = path.resolve(__dirname, "gold-mint-mainnet-info.json");

async function main() {
  if (!fs.existsSync(MINT_INFO)) {
    console.error("❌ gold-mint-mainnet-info.json not found. Run 02-create-gold-mint.js first.");
    process.exit(1);
  }
  const mint = new PublicKey(JSON.parse(fs.readFileSync(MINT_INFO, "utf8")).mint);

  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(DEPLOYER, "utf8"))));
  const PROG = Keypair.fromSecretKey(Uint8Array.from(PROG_ARR)).publicKey;

  const [gameConfigPda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from("silver_config_v2")], PROG);

  const conn = new Connection(RPC, "confirmed");
  console.log("RPC          :", RPC);
  console.log("Deployer     :", payer.publicKey.toBase58());
  console.log("Program      :", PROG.toBase58());
  console.log("GameConfigPDA:", gameConfigPda.toBase58(), "(bump", bump + ")");
  console.log("GOLD mint    :", mint.toBase58());
  console.log("Policy       : NO PRE-MINE — this script mints nothing.");

  // Guard: GameConfig PDA must exist (created by 05-init-game.js)
  const cfgAcct = await conn.getAccountInfo(gameConfigPda);
  if (!cfgAcct) {
    console.error("❌ GameConfig PDA not found — run 05-init-game.js first.");
    process.exit(1);
  }

  // Current authority
  const mintInfo = await getMint(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const curAuth = mintInfo.mintAuthority?.toBase58();
  console.log("\nCurrent mint authority:", curAuth);
  console.log("Target mint authority :", gameConfigPda.toBase58());

  if (curAuth === gameConfigPda.toBase58()) {
    console.log("✅ Mint authority is already the GameConfig PDA — nothing to do.");
  } else {
    if (curAuth !== payer.publicKey.toBase58()) {
      console.error("❌ Mint authority is neither the deployer nor the GameConfig PDA.");
      console.error("   Current:", curAuth, "— cannot transfer from here. Aborting.");
      process.exit(1);
    }
    console.log("\n>>> Transferring mint authority deployer → GameConfig PDA...");
    const tx = new Transaction().add(createSetAuthorityInstruction(
      mint, payer.publicKey, AuthorityType.MintTokens, gameConfigPda, [], TOKEN_2022_PROGRAM_ID));
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    const sig = await conn.sendTransaction(tx, [payer], { skipPreflight: false, preflightCommitment: "confirmed" });
    await conn.confirmTransaction(sig, "confirmed");
    console.log("✅ Mint authority transferred:", sig);
  }

  // Final verify
  const fin = await getMint(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("\n=== FINAL MINT STATE ===");
  console.log("Mint authority:", fin.mintAuthority?.toBase58());
  console.log("Supply        :", (Number(fin.supply) / 1e9).toLocaleString(), "GOLD (must be 0 — no pre-mine)");
  console.log("Authority = GameConfigPDA ?", fin.mintAuthority?.toBase58() === gameConfigPda.toBase58() ? "✅" : "❌");

  // Save updated info
  const info = JSON.parse(fs.readFileSync(MINT_INFO, "utf8"));
  info.mintAuthority = gameConfigPda.toBase58();
  info.preMine = "none (mint-on-demand only — litepaper)";
  fs.writeFileSync(MINT_INFO, JSON.stringify(info, null, 2));
  console.log("\nUpdated:", MINT_INFO);
}

main().catch(e => { console.error(e); process.exit(1); });
