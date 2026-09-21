#!/usr/bin/env node
/**
 * Gold Miner v2 — Create MAINNET GOLD mint (Token-2022, PLAIN mint).
 *
 * PROVEN TESTNET-RECIPE (create-gold-mint-v5.js + live testnet mint FEksZ...):
 *   The live GOLD mint on testnet is a PLAIN 82-byte Token-2022 mint — NO
 *   metadata extension. Metadata (Goldium / GOLD / Arweave image) is OFF-CHAIN:
 *   it lives in the app/litepaper, not in the mint. Replicating testnet on
 *   mainnet = same plain mint + authority -> GameConfig PDA in one tx.
 *
 * One atomic transaction (order matters):
 *   1. createAccount 82-byte Token-2022 mint
 *   2. InitializeMint2 (decimals=9, mintAuthority=deployer, freeze=null)
 *
 * The mint authority transfer deployer -> GameConfig PDA is a SEPARATE step
 * (06-set-mint-authority.js) because the GameConfig PDA is created by
 * 05-init-game.js AFTER this step. So this step leaves authority on the deployer.
 *
 * Off-chain metadata to pin in the frontend (launch plan §2.2):
 *   name: Goldium | symbol: GOLD | decimals: 9
 *   image: https://arweave.net/cxmHUDnAAt9jUV4RDiEFM5jkoUCR8awzIcnSpcD1r5o
 *
 * Outputs gold-mint-mainnet-info.json (public addresses only — no secrets).
 * Usage: node scripts/mainnet/02-create-gold-mint.js
 */
const path = require("path");
const fs = require("fs");
const { Connection, Keypair, SystemProgram, PublicKey, Transaction } = require("@solana/web3.js");
const {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMint2Instruction,
  getMint,
} = require("@solana/spl-token");

const RPC = "https://rpc.mainnet.x1.xyz";
const PAYER_KEYPAIR = path.resolve(__dirname, "../../../secure/gold-miner-mainnet/deployer-mainnet.json");
const PROG_ARR = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../target/deploy/gold_miner_mainnet-keypair.json"), "utf8"));

const DECIMALS = 9;
const NAME = "Goldium";
const SYMBOL = "GOLD";
// OFF-CHAIN metadata URI (same as launch plan §2.2 / litepaper)
const URI = "https://arweave.net/cxmHUDnAAt9jUV4RDiEFM5jkoUCR8awzIcnSpcD1r5o";

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR, "utf8"))));
  const PROG = Keypair.fromSecretKey(Uint8Array.from(PROG_ARR)).publicKey;
  const [gameConfigPda, bump] = PublicKey.findProgramAddressSync([Buffer.from("silver_config_v2")], PROG);

  console.log("Network :", RPC);
  console.log("Payer   :", payer.publicKey.toBase58());
  console.log("Balance :", await conn.getBalance(payer.publicKey));
  console.log("Program :", PROG.toBase58());
  console.log("GameConfigPDA (future mint auth):", gameConfigPda.toBase58(), "(bump", bump + ")");

  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  console.log("New mint:", mint.toBase58(), "(plain Token-2022, no metadata ext — matches testnet)");

  // Plain 82-byte mint; authority stays on deployer here (moved to GameConfig
  // PDA in 06-set-mint-authority.js after init_game creates that PDA)
  const mintLen = 82;
  const lamports = await conn.getMinimumBalanceForRentExemption(mintLen);

  const createIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey, newAccountPubkey: mint, space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID,
  });
  const initMint2Ix = createInitializeMint2Instruction(mint, DECIMALS, payer.publicKey, null, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction();
  tx.add(createIx, initMint2Ix);
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(payer, mintKp);

  console.log("\nSending mint creation (atomic, skipPreflight:false) ...");
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  await conn.confirmTransaction(sig, "confirmed");
  console.log("✅ Mint created:", sig);

  // Verify
  const mi = await getMint(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  console.log("\n--- Verification ---");
  console.log("Mint address   :", mint.toBase58());
  console.log("Len (expect 82):", (await conn.getAccountInfo(mint)).data.length);
  console.log("Decimals       :", mi.decimals);
  console.log("Supply         :", mi.supply.toString(), "(must be 0 — no pre-mine)");
  console.log("Mint authority :", mi.mintAuthority?.toBase58(), "(deployer for now — transfer to GameConfig PDA in step 06)");

  // Save public info (no secrets)
  const info = {
    network: "X1 Mainnet",
    rpc: RPC,
    mint: mint.toBase58(),
    decimals: DECIMALS,
    name: NAME,
    symbol: SYMBOL,
    uri: URI, // off-chain metadata reference
    metadataOnChain: false, // plain mint — matches testnet
    mintAuthorityNow: payer.publicKey.toBase58(), // deployer until 06-set-mint-authority
    targetMintAuthority: gameConfigPda.toBase58(), // moved here in step 06
    freezeAuthority: null,
    deployer: payer.publicKey.toBase58(),
    programId: PROG.toBase58(),
    gameConfigPda: gameConfigPda.toBase58(),
    preMine: "none (mint-on-demand only — litepaper)",
    createdAt: new Date().toISOString(),
    tx: sig,
  };
  fs.writeFileSync(path.resolve(__dirname, "gold-mint-mainnet-info.json"), JSON.stringify(info, null, 2));
  console.log("\nSaved: gold-mint-mainnet-info.json");
  console.log("\n--- ADD TO app/.env.production ---");
  console.log(`NEXT_PUBLIC_GOLD_MINT=${mint.toBase58()}`);
  console.log(`NEXT_PUBLIC_GOLD_METADATA_URI=${URI}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
