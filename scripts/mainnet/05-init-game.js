#!/usr/bin/env node
/**
 * Gold Miner v2 — Initialize MAINNET game state.
 * Uses RAW TransactionInstructions with hardcoded Anchor discriminators —
 * the proven testnet pattern (init-game-v4.js), NOT the Anchor Program class
 * (the minimal IDL has no account types → Program() throws).
 *
 * Sequence: 1) pre-create 128KB program-owned bitmap
 *           2) initialize_game (creates GameConfig PDA, stores gold_mint)
 *           3) init_treasury (creates Treasury PDA)
 *           4) update_gold_mint only if stored mint != mainnet mint
 *
 * Discriminators (sha256("global:<name>")[0..8]):
 *   initialize_game : 2c3e66f77ed082d7  [44,62,102,247,126,208,130,215]
 *   init_treasury   : 6998ad339e97310e  [105,152,173,51,158,151,49,14]
 *   update_gold_mint: f0ee5f4af1f18075  [240,238,95,74,241,241,128,117]
 *
 * Requires: program deployed (01), GOLD mint created (02).
 * Usage: node scripts/mainnet/05-init-game.js
 */
const path = require("path");
const fs = require("fs");
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require("@solana/web3.js");

const RPC = "https://rpc.mainnet.x1.xyz";
const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const DEPLOYER = path.resolve(__dirname, "../../../secure/gold-miner-mainnet/deployer-mainnet.json");
const PROG_ARR = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../target/deploy/gold_miner_mainnet-keypair.json"), "utf8"));

const DIS_INIT = Buffer.from([44, 62, 102, 247, 126, 208, 130, 215]);
const DIS_TREAS = Buffer.from([105, 152, 173, 51, 158, 151, 49, 14]);
const DIS_UPDATE = Buffer.from([240, 238, 95, 74, 241, 241, 128, 117]);

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(DEPLOYER, "utf8"))));
  const PROG = Keypair.fromSecretKey(Uint8Array.from(PROG_ARR)).publicKey;
  const GOLD_MINT = new PublicKey(JSON.parse(fs.readFileSync(path.resolve(__dirname, "gold-mint-mainnet-info.json"), "utf8")).mint);

  const [cfgPda] = PublicKey.findProgramAddressSync([Buffer.from("silver_config_v2")], PROG);
  const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury"), cfgPda.toBuffer()], PROG);

  console.log("RPC      :", RPC);
  console.log("Deployer :", payer.publicKey.toBase58());
  console.log("Program  :", PROG.toBase58());
  console.log("GOLD mint:", GOLD_MINT.toBase58());
  console.log("GameConfigPDA:", cfgPda.toBase58());
  console.log("Treasury PDA :", treasuryPda.toBase58());
  console.log("Balance  :", await conn.getBalance(payer.publicKey));

  const existingCfg = await conn.getAccountInfo(cfgPda);

  // ── 1+2. bitmap + initialize_game (skip if config exists) ──
  if (existingCfg) {
    console.log("\n✅ GameConfig already exists — skipping initialize_game + bitmap.");
  } else {
    const bmKp = Keypair.generate();
    const BM_SIZE = 131072;
    const lamports = await conn.getMinimumBalanceForRentExemption(BM_SIZE);
    console.log(`\n>>> Pre-creating 128KB bitmap (rent ${(lamports/1e9).toFixed(6)} SOL):`, bmKp.publicKey.toBase58());

    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight });
    tx.add(SystemProgram.createAccount({
      fromPubkey: payer.publicKey, newAccountPubkey: bmKp.publicKey, lamports, space: BM_SIZE, programId: PROG,
    }));
    tx.add(new TransactionInstruction({
      programId: PROG,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },  // authority (ADMIN)
        { pubkey: cfgPda, isSigner: false, isWritable: true },           // game_config
        { pubkey: bmKp.publicKey, isSigner: false, isWritable: true },  // gold_bitmap
        { pubkey: GOLD_MINT, isSigner: false, isWritable: true },        // gold_mint
        { pubkey: T22, isSigner: false, isWritable: false },             // token_program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: DIS_INIT,
    }));
    console.log(">>> Sending initialize_game...");
    const sig = await conn.sendTransaction(tx, [payer, bmKp], { skipPreflight: false, preflightCommitment: "confirmed" });
    await conn.confirmTransaction(sig, "confirmed");
    console.log("✅ initialize_game:", sig);

    // persist bitmap keypair for frontend
    fs.writeFileSync(path.resolve(__dirname, "gold-bitmap-mainnet-keypair.json"), JSON.stringify(Array.from(bmKp.secretKey)));
    console.log("Saved bitmap keypair.");
  }

  // ── 3. init_treasury ──
  const tExists = await conn.getAccountInfo(treasuryPda);
  if (tExists) {
    console.log("\n✅ Treasury already exists — skipping init_treasury.");
  } else {
    console.log("\n>>> init_treasury...");
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight });
    tx.add(new TransactionInstruction({
      programId: PROG,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },  // authority
        { pubkey: cfgPda, isSigner: false, isWritable: true },           // game_config
        { pubkey: treasuryPda, isSigner: false, isWritable: true },      // treasury
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: DIS_TREAS,
    }));
    const sig = await conn.sendTransaction(tx, [payer], { skipPreflight: false, preflightCommitment: "confirmed" });
    await conn.confirmTransaction(sig, "confirmed");
    console.log("✅ init_treasury:", sig);
  }

  // ── 4. update_gold_mint (only if stored != mainnet mint) ──
  const ci = await conn.getAccountInfo(cfgPda);
  if (ci && ci.data.length >= 76) {
    const storedMint = new PublicKey(ci.data.slice(44, 76)).toBase58(); // authority(32)+grid_size(4)=offset44
    if (storedMint === GOLD_MINT.toBase58()) {
      console.log("\n✅ gold_mint already correct:", GOLD_MINT.toBase58());
    } else {
      console.log("\n>>> update_gold_mint →", GOLD_MINT.toBase58(), "(was", storedMint, ")");
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight });
      tx.add(new TransactionInstruction({
        programId: PROG,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },  // authority
          { pubkey: cfgPda, isSigner: false, isWritable: true },           // game_config
          { pubkey: GOLD_MINT, isSigner: false, isWritable: true },        // new_gold_mint
          { pubkey: T22, isSigner: false, isWritable: false },             // token_program
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: DIS_UPDATE,
      }));
      const sig = await conn.sendTransaction(tx, [payer], { skipPreflight: false, preflightCommitment: "confirmed" });
      await conn.confirmTransaction(sig, "confirmed");
      console.log("✅ update_gold_mint:", sig);
    }
  } else {
    console.log("\n⚠️  Could not read GameConfig data (len", ci && ci.data.length, ") — skipping update check.");
  }

  console.log("\n=== INIT COMPLETE ===");
  console.log("GameConfig PDA:", cfgPda.toBase58());
  console.log("Treasury PDA  :", treasuryPda.toBase58());
  console.log("GOLD mint     :", GOLD_MINT.toBase58());
  console.log("\n>>> Now run: node scripts/mainnet/06-set-mint-authority.js");
}

main().catch(e => { console.error(e); process.exit(1); });
