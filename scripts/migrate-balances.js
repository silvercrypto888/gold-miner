// ============================================================
// ⚠️  HISTORICAL SCRIPT — NOT FOR CURRENT DEPLOYMENT
// This script references an older GOLD mint (v2/v3 era).
// The current active mint is v4: EarL8NaAje3mx5UGC86CWByVnotKgibkGmuJh6bHcWdz
// Keep for reference only. Do not run against current deployment.
// ============================================================

const { Connection, PublicKey, Keypair, Transaction, SystemProgram } = require("@solana/web3.js");
const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, createMintToInstruction, TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");
const fs = require("fs");

const RPC_URL = "https://rpc.testnet.x1.xyz";
const NEW_GOLD_MINT = "9RThpUMiFo5ioaREZkJD5wd5VPr5peBYbX8212r1KkQB";
const OLD_MINT = "HRby9JcNp67dWCrdxwKyNohDu7WqoWmM9cbrodQCTEAq";
const TREASURY_PDA = "8NK7dBvzJ9MmTDWjfX3AAW2fkWGewNsGsqE2HWf847Wv";

// Token accounts for old mint (from RPC query)
const OLD_TOKEN_ACCOUNTS = [
  { address: "4e7r6x4pLyQFELi1efMSPqgVBb8De3NW4fK5c7DX8q3N", owner: "A9kbMEknBao8YdMyqMLiUPkkArsr8TghGFQAtyZ3U8ZB", amount: "655755884541853" },
  { address: "5mCfZdbYfUyYHwVLdDQwnAEv6YJgiGi2dihfrEuv3AYx", owner: "2HbqjtA9gB9c95c8KkUUWxhtNjCfYcPbvfdhcdobbq1C", amount: "29143775777795" },
  { address: "G2Pq5e2tCYeYsvJFVBUsgJH6g25X3C9u8mswi53Wa7Pv", owner: "DS4keEcVVdCCUs5mBLUYn7CjEuhuLzNxX798UxuHBkGx", amount: "300000000000" },
  { address: "AZWYopRsjPzpBzb6vQUow5ewNjtpsvZ8rP8Lu6ZuzqeJ", owner: "8NK7dBvzJ9MmTDWjfX3AAW2fkWGewNsGsqE2HWf847Wv", amount: "100339680352" },
  { address: "EobRMhXN4b7TYFJVh9KhJSM8UAMPmAfcYntkqJFYTkRb", owner: "FTMSbJeQC2ayfRRirCt47jz2tiAtZibBRawq93tyWpM6", amount: "0" },
  { address: "FCzUbfJ2T1cH9zXFYp7GxNn6t3cwP1wzwwBQsDUycLaA", owner: "2zotLCHPhTazmMVaRg9y4bmRm8mbBHb5XuvbV4mcQRAS", amount: "100000000000" },
];

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");

  const keypairPath = process.env.HOME + "/.config/solana/id.json";
  const deployerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );
  console.log("Mint authority:", deployerKeypair.publicKey.toBase58());

  const newMintPubkey = new PublicKey(NEW_GOLD_MINT);
  const results = [];

  for (const acc of OLD_TOKEN_ACCOUNTS) {
    const owner = new PublicKey(acc.owner);
    const amount = BigInt(acc.amount);

    if (amount === 0n) {
      console.log(`Skipping ${acc.owner} — zero balance`);
      continue;
    }

    // Derive new ATA (allow off-curve owners for PDAs like treasury)
    const newAta = getAssociatedTokenAddressSync(newMintPubkey, owner, true, TOKEN_2022_PROGRAM_ID);
    console.log(`\nMigrating ${acc.owner}:`);
    console.log(`  Old ATA: ${acc.address}`);
    console.log(`  New ATA: ${newAta.toBase58()}`);
    console.log(`  Amount: ${amount.toString()} (raw)`);

    // Check if new ATA exists
    const ataInfo = await connection.getAccountInfo(newAta);
    const tx = new Transaction();

    if (!ataInfo) {
      console.log(`  Creating new ATA...`);
      tx.add(
        createAssociatedTokenAccountInstruction(
          deployerKeypair.publicKey,  // payer
          newAta,                       // ata
          owner,                        // owner
          newMintPubkey,                // mint
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    // Mint tokens
    tx.add(
      createMintToInstruction(
        newMintPubkey,
        newAta,
        deployerKeypair.publicKey,  // mint authority
        amount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

    tx.feePayer = deployerKeypair.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const sig = await connection.sendTransaction(tx, [deployerKeypair], { commitment: "confirmed" });
    console.log(`  ✅ Success! Tx: ${sig}`);

    results.push({ owner: acc.owner, amount: amount.toString(), tx: sig });
  }

  console.log("\n=== Migration Summary ===");
  console.log(`Migrated ${results.length} accounts`);
  for (const r of results) {
    console.log(`  ${r.owner}: ${r.amount} — ${r.tx}`);
  }
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
