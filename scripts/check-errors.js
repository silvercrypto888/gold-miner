const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const SILVER_WALLET = new PublicKey("A9kbMEknBao8YdMyqMLiUPkkArsr8TghGFQAtyZ3U8ZB");
const conn = new Connection(RPC, "confirmed");

async function main() {
  // Check Silver's recent transactions for treasury_auto_lp failures
  const sigs = await conn.getSignaturesForAddress(SILVER_WALLET, { limit: 30 });
  const failed = sigs.filter(s => s.err !== null);
  console.log(`Failed transactions: ${failed.length} / ${sigs.length} recent`);
  
  for (const f of failed.slice(0, 5)) {
    console.log(`\nTX: ${f.signature.slice(0, 20)}... | slot ${f.slot} | ${JSON.stringify(f.err)}`);
    try {
      const tx = await conn.getTransaction(f.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (tx && tx.meta && tx.meta.logMessages) {
        for (const log of tx.meta.logMessages) {
          if (log.includes("Error") || log.includes("error") || log.includes("require") || log.includes("gold_miner")) {
            console.log(`  LOG: ${log}`);
          }
        }
      }
    } catch(e) {}
  }
  
  // Also check program-level errors
  console.log("\n=== Checking program-level errors ===");
  const progSigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 20 });
  const progFailed = progSigs.filter(s => s.err !== null);
  console.log(`Failed program txs: ${progFailed.length} / ${progSigs.length} recent`);
  
  for (const f of progFailed.slice(0, 5)) {
    console.log(`\nTX: ${f.signature.slice(0, 20)}... | slot ${f.slot}`);
    try {
      const tx = await conn.getTransaction(f.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (tx && tx.meta && tx.meta.logMessages) {
        for (const log of tx.meta.logMessages) {
          if (log.includes("GoldMinerError") || log.includes("Error") || log.includes("Insufficient") || log.includes("require")) {
            console.log(`  LOG: ${log}`);
          }
        }
      }
    } catch(e) {}
  }
}

main().catch(console.error);
