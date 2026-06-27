#!/usr/bin/env node
const {
  Connection, Keypair, PublicKey, Transaction,
  SystemProgram, LAMPORTS_PER_SOL
} = require("@solana/web3.js");
const {
  createInitializeMint2Instruction, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction, mintTo
} = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const RPC = "https://x1-testnet.xen.network";
const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const PROG = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");

async function main() {
  const dep = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(process.env.HOME, ".config/solana/id.json"), "utf-8"))));

  const [gcPda] = PublicKey.findProgramAddressSync([Buffer.from("game_config_v2")], PROG);

  const conn = new Connection(RPC, "confirmed");

  // Create new mint keypair
  const mintKp = Keypair.generate();
  console.log("New GOLD mint:", mintKp.publicKey.toBase58());
  console.log("Mint authority (game_config_v2):", gcPda.toBase58());
  console.log("Deployer:", dep.publicKey.toBase58());

  const mintLamports = await conn.getMinimumBalanceForRentExemption(82);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();

  const tx = new Transaction({ feePayer: dep.publicKey, blockhash, lastValidBlockHeight });

  tx.add(SystemProgram.createAccount({
    fromPubkey: dep.publicKey,
    newAccountPubkey: mintKp.publicKey,
    lamports: mintLamports,
    space: 82,
    programId: T22,
  }));

  tx.add(createInitializeMint2Instruction(
    mintKp.publicKey,
    9,
    gcPda,   // mint authority = game_config_v2 PDA
    null,     // no freeze authority
    T22
  ));

  const sig = await conn.sendTransaction(tx, [dep, mintKp]);
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  console.log("✅ Mint created:", sig);

  // Save mint info
  const info = {
    network: "X1 Testnet",
    mint: mintKp.publicKey.toBase58(),
    decimals: 9,
    name: "Goldium",
    symbol: "GOLD",
    mintAuthority: gcPda.toBase58(),
    freezeAuthority: null,
    programId: PROG.toBase58(),
    deployer: dep.publicKey.toBase58(),
    gameConfigPda: gcPda.toBase58(),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.resolve(__dirname, "gold-mint-v3-info.json"),
    JSON.stringify(info, null, 2)
  );
  console.log("Saved to: scripts/gold-mint-v3-info.json");
  console.log("\nUse this as your NEXT_PUBLIC_GOLD_MINT");
}

main().catch(e => { console.error(e); process.exit(1); });
