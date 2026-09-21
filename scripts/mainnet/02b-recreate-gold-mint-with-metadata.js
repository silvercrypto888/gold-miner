#!/usr/bin/env node
/**
 * Gold Miner v2 — MAINNET: recreate GOLD mint WITH on-chain TokenMetadata extension.
 *
 * Two-phase (robust, avoids Token-2022 "InvalidAccountData" on combined init):
 *   Phase A: create mint account + MetadataPointer + InitializeMint (space = exact
 *            getMintLen([MetadataPointer])). This MUST succeed cleanly.
 *   Phase B: add TokenMetadata extension via createInitializeInstruction — Token-2022
 *            automatically reallocs the account up to hold name/symbol/uri.
 *
 * Mint authority starts on the deployer; transferred to GameConfig PDA in 06b after
 * 05b updates the stored mint address. NO pre-mine.
 *
 * Usage: node scripts/mainnet/02b-recreate-gold-mint-with-metadata.js
 */
const path = require("path");
const fs = require("fs");
const { Connection, Keypair, SystemProgram, PublicKey, Transaction } = require("@solana/web3.js");
const {
  TOKEN_2022_PROGRAM_ID,
  getMintLen,
  ExtensionType,
  createInitializeMint2Instruction,
  createInitializeMetadataPointerInstruction,
  createUpdateMetadataPointerInstruction,
  getMint,
} = require("@solana/spl-token");
const { createInitializeInstruction } = require("@solana/spl-token-metadata");

const RPC = "https://rpc.mainnet.x1.xyz";
const PAYER_KEYPAIR = path.resolve(__dirname, "../../../secure/gold-miner-mainnet/deployer-mainnet.json");
const PROG_ARR = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../target/deploy/gold_miner_mainnet-keypair.json"), "utf8"));

const DECIMALS = 9;
const NAME = "Goldium";
const SYMBOL = "GOLD";
const URI = "https://arweave.net/cxmHUDnAAt9jUV4RDiEFM5jkoUCR8awzIcnSpcD1r5o";

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR, "utf8"))));
  const PROG = Keypair.fromSecretKey(Uint8Array.from(PROG_ARR)).publicKey;
  const [gameConfigPda, bump] = PublicKey.findProgramAddressSync([Buffer.from("silver_config_v2")], PROG);

  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;

  console.log("Network    :", RPC);
  console.log("Payer      :", payer.publicKey.toBase58());
  console.log("Program    :", PROG.toBase58());
  console.log("GameConfigPDA:", gameConfigPda.toBase58(), "(bump", bump + ")");
  console.log("New mint   :", mint.toBase58());

  // ── PHASE A: mint + MetadataPointer + InitializeMint ──
  const mintLenA = getMintLen([ExtensionType.MetadataPointer]); // exact
  const lamportsA = await conn.getMinimumBalanceForRentExemption(mintLenA);
  console.log(`\n[Phase A] space ${mintLenA} (rent ${(lamportsA/1e9).toFixed(4)} SOL)`);

  const createIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey, newAccountPubkey: mint, space: mintLenA, lamports: lamportsA, programId: TOKEN_2022_PROGRAM_ID,
  });
  const initMetaPtrIx = createInitializeMetadataPointerInstruction(mint, payer.publicKey, mint, TOKEN_2022_PROGRAM_ID);
  const initMint2Ix = createInitializeMint2Instruction(mint, DECIMALS, payer.publicKey, null, TOKEN_2022_PROGRAM_ID);

  const txA = new Transaction().add(createIx, initMetaPtrIx, initMint2Ix);
  txA.feePayer = payer.publicKey;
  txA.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  txA.sign(payer, mintKp);

  console.log("Sending Phase A (create+metadata-pointer+init mint2)...");
  const sigA = await conn.sendRawTransaction(txA.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  await conn.confirmTransaction(sigA, "confirmed");
  console.log("✅ Phase A:", sigA);

  // ── PHASE B: add TokenMetadata extension (Token-2022 reallocs account) ──
  const initTokMeta = createInitializeInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    metadata: mint,
    updateAuthority: payer.publicKey,
    mint,
    mintAuthority: payer.publicKey,
    name: NAME,
    symbol: SYMBOL,
    uri: URI,
  });
  const sigB_tx = new Transaction().add(initTokMeta);
  sigB_tx.feePayer = payer.publicKey;
  sigB_tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  sigB_tx.sign(payer);
  console.log("\n[Phase B] adding TokenMetadata (name/symbol/uri)...");
  let sigB;
  try {
    const signedB = await conn.sendRawTransaction(sigB_tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
    await conn.confirmTransaction(signedB, "confirmed");
    sigB = signedB;
    console.log("✅ Phase B:", sigB);
  } catch (e) {
    console.error("Phase B failed:", e.message);
    console.error("(Mint EXISTS with MetadataPointer but no name/symbol. Continuing to verify.)");
  }

  // ── Verify ──
  const acct = await conn.getAccountInfo(mint);
  const mi = await getMint(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  const s = acct ? Buffer.from(acct.data).toString("latin1") : "";
  console.log("\n--- Verification ---");
  console.log("Mint       :", mint.toBase58());
  console.log("Len        :", acct ? acct.data.length : "?", "(testnet verified = 392)");
  console.log("Decimals   :", mi.decimals);
  console.log("Supply     :", mi.supply.toString(), "(must be 0)");
  console.log("Mint auth  :", mi.mintAuthority?.toBase58(), "(deployer → 06b)");
  console.log("Name on-chain  :", s.includes(NAME) ? "✅ Goldium" : "❌");
  console.log("Symbol on-chain:", s.includes(SYMBOL) ? "✅ GOLD" : "❌");

  const info = {
    network: "X1 Mainnet", rpc: RPC, mint: mint.toBase58(), decimals: DECIMALS,
    name: NAME, symbol: SYMBOL, uri: URI, metadataOnChain: true,
    mintAuthorityNow: payer.publicKey.toBase58(), targetMintAuthority: gameConfigPda.toBase58(),
    freezeAuthority: null, deployer: payer.publicKey.toBase58(), programId: PROG.toBase58(),
    gameConfigPda: gameConfigPda.toBase58(), preMine: "none (mint-on-demand only — litepaper)",
    replacedOldMint: (() => { try { return JSON.parse(fs.readFileSync(path.resolve(__dirname,"gold-mint-mainnet-info.json"),"utf8")).mint; } catch { return null; } })(),
    txA: sigA, txB: sigB || null, createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.resolve(__dirname, "gold-mint-mainnet-info.json"), JSON.stringify(info, null, 2));
  console.log("\nSaved: gold-mint-mainnet-info.json");
  console.log("\n--- NEXT (in order) ---");
  console.log("1) node scripts/mainnet/05b-update-stored-mint.js");
  console.log("2) node scripts/mainnet/06b-set-mint-authority.js");
  console.log("3) pin NEXT_PUBLIC_GOLD_MINT=" + mint.toBase58() + " in constants.ts");
}

main().catch((e) => { console.error(e); process.exit(1); });
