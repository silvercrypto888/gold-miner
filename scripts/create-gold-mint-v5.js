#!/usr/bin/env node
const {
  Connection, Keypair, PublicKey, Transaction,
  SystemProgram
} = require("@solana/web3.js");
const {
  createInitializeMintInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
  getMint
} = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const RPC = "https://x1-testnet.xen.network";
const T22 = TOKEN_2022_PROGRAM_ID;
const PROG = new PublicKey("4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM");
const MINT_ACCOUNT_SIZE = 82; // Standard SPL Mint struct size

async function main() {
  const dep = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(process.env.HOME, ".config/solana/id.json"), "utf-8"))));

  const conn = new Connection(RPC, "confirmed");
  const [gameConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("silver_config_v2")], PROG);

  console.log("Deployer:", dep.publicKey.toBase58());
  console.log("GameConfig PDA (future mint auth):", gameConfigPda.toBase58());

  // Create new mint keypair
  const mintKp = Keypair.generate();
  console.log("\nNew GOLD mint:", mintKp.publicKey.toBase58());

  const mintRent = await conn.getMinimumBalanceForRentExemption(MINT_ACCOUNT_SIZE);

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: dep.publicKey, blockhash, lastValidBlockHeight });

  // Create mint account
  tx.add(SystemProgram.createAccount({
    fromPubkey: dep.publicKey,
    newAccountPubkey: mintKp.publicKey,
    lamports: mintRent,
    space: MINT_ACCOUNT_SIZE,
    programId: T22,
  }));

  // Initialize mint with deployer as authority
  tx.add(createInitializeMintInstruction(
    mintKp.publicKey,
    9, // decimals
    dep.publicKey, // mint authority
    null, // freeze authority
    T22
  ));

  // Transfer mint authority to game_config PDA
  tx.add(createSetAuthorityInstruction(
    mintKp.publicKey,
    dep.publicKey, // current authority
    AuthorityType.MintTokens,
    gameConfigPda, // new authority
    [],
    T22
  ));

  const sig = await conn.sendTransaction(tx, [dep, mintKp]);
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  console.log("✅ Mint created + authority transferred:", sig);

  // Save info
  const info = {
    network: "X1 Testnet",
    mint: mintKp.publicKey.toBase58(),
    decimals: 9,
    name: "Goldium",
    symbol: "GOLD",
    mintAuthority: gameConfigPda.toBase58(),
    freezeAuthority: null,
    programId: PROG.toBase58(),
    deployer: dep.publicKey.toBase58(),
    createdAt: new Date().toISOString()
  };
  const infoPath = path.resolve(__dirname, "gold-mint-v5-info.json");
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
  console.log("\nSaved:", infoPath);

  // Verify
  const mintInfo = await getMint(conn, mintKp.publicKey, "confirmed", T22);
  console.log("\nMint verification:");
  console.log("  Supply:", mintInfo.supply.toString());
  console.log("  Decimals:", mintInfo.decimals);
  console.log("  MintAuthority:", mintInfo.mintAuthority?.toBase58() || "null");
  console.log("  Match gameConfig?", mintInfo.mintAuthority?.toBase58() === gameConfigPda.toBase58() ? "✅" : "❌");

  console.log("\n--- ADD TO .env.local ---");
  console.log(`NEXT_PUBLIC_GOLD_MINT=${mintKp.publicKey.toBase58()}`);
}

main().catch(e => { console.error(e); process.exit(1); });
