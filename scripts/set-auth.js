#!/usr/bin/env node
// Set GOLD mint authority to GameConfig PDA
const { PublicKey, Connection, Keypair, Transaction } = require("@solana/web3.js");
const { createSetAuthorityInstruction, AuthorityType, TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

const RPC = "https://rpc.testnet.x1.xyz";
const PROG = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const GM = new PublicKey("HRby9JcNp67dWCrdxwKyNohDu7WqoWmM9cbrodQCTEAq");

async function main() {
  const dep = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(process.env.HOME, ".config/solana/id.json"), "utf-8"))));
  const [cfgPda] = PublicKey.findProgramAddressSync([Buffer.from("game_config")], PROG);

  console.log("Current owner (deployer):", dep.publicKey.toString());
  console.log("New mint authority (GameConfig PDA):", cfgPda.toString());

  const conn = new Connection(RPC, "confirmed");

  const ix = createSetAuthorityInstruction(
    GM,                        // mint address
    dep.publicKey,             // current authority
    AuthorityType.MintTokens,  // authority type
    cfgPda,                    // new authority (GameConfig PDA)
    [],                        // multisig signers
    TOKEN_2022_PROGRAM_ID      // token program
  );

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: dep.publicKey, blockhash, lastValidBlockHeight });
  tx.add(ix);

  console.log("\nSetting mint authority to GameConfig PDA...");
  const sig = await conn.sendTransaction(tx, [dep]);
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  console.log("TX:", sig);
  console.log("\n✅ Mint authority transferred!");
}

main().catch(e => { console.error("ERROR:", e); process.exit(1); });
