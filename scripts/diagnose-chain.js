const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");

async function main() {
  const conn = new Connection(RPC, "confirmed");
  
  // Get ALL recent signatures (last 50)
  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 50 });
  console.log("Last 50 transactions:");
  console.log("Sig | Slot | Time | Err | Type");
  console.log("-".repeat(80));
  
  for (const sig of sigs) {
    // Get transaction details to see instruction type
    let txType = "?";
    try {
      const tx = await conn.getTransaction(sig.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (tx && tx.transaction) {
        const msg = tx.transaction.message;
        const accounts = msg.staticAccountKeys || msg.accountKeys;
        const programIdx = accounts.findIndex(a => a.toBase58() === PROGRAM_ID.toBase58());
        if (programIdx >= 0) {
          // Find the instruction that calls our program
          const ixs = msg.compiledInstructions || tx.transaction.message.instructions;
          for (const ix of ixs) {
            if (ix.programIdIndex === programIdx) {
              // First 8 bytes = discriminator
              const data = Buffer.from(ix.data, 'base64');
              const disc = Array.from(data.slice(0, 8)).map(b => b.toString(16).padStart(2,'0')).join('');
              // Map discriminators to names
              const discMap = {
                'e0ee5f4af1818075': 'updateGoldMint',
                '7e8f33ebda9f3e08': 'joinGame',
                '5a5ff0f5c8b0a0e0': 'startSession',
                '8fbe5adac41e33de': 'moveAndMine',
                'f223c68952e1f2b6': 'treasuryAutoLp',
                '': 'other',
              };
              txType = discMap[disc] || `disc:${disc}`;
              break;
            }
          }
        }
      }
    } catch(e) {}
    
    const time = sig.blockTime ? new Date(sig.blockTime * 1000).toISOString().slice(11, 19) : '?';
    const errStr = sig.err ? JSON.stringify(sig.err).slice(0, 30) : 'OK';
    console.log(`${sig.signature.slice(0, 20)}... | ${sig.slot} | ${time} | ${errStr} | ${txType}`);
  }
  
  // Check current slot
  const slot = await conn.getSlot();
  console.log(`\nCurrent slot: ${slot}`);
  console.log(`SESSION_DURATION_SLOTS: 36000 (~4 hours)`);
}

main().catch(console.error);
