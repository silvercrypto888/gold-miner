const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const conn = new Connection(RPC, "confirmed");

async function main() {
  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 30 });
  
  console.log("Recent program transactions (looking for moveAndMine):\n");
  console.log("Type | Sig | Slot | Time | Err | Wallet");
  console.log("-".repeat(100));
  
  for (const sig of sigs) {
    try {
      const tx = await conn.getTransaction(sig.signature, { 
        commitment: "confirmed", 
        maxSupportedTransactionVersion: 0 
      });
      if (!tx || !tx.transaction) continue;
      
      const msg = tx.transaction.message;
      const accounts = msg.staticAccountKeys || msg.accountKeys;
      const programIdx = accounts.findIndex(a => a.toBase58() === PROGRAM_ID.toBase58());
      if (programIdx < 0) continue;
      
      const ixs = msg.compiledInstructions || tx.transaction.message.instructions;
      for (const ix of ixs) {
        if (ix.programIdIndex === programIdx) {
          const data = Buffer.from(ix.data, 'base64');
          const disc = Array.from(data.slice(0, 8)).map(b => b.toString(16).padStart(2,'0')).join('');
          
          // Map discriminators
          const discMap = {
            'f0ee5f4af1f18075': 'updateGoldMint',
            '1acae43fce04893f': 'moveAndMine',
            '17e36f8ed4e603af': 'joinGame',
            '58d6167f68e6a9e1': 'startSession',
            'f223c68952e1f2b6': 'treasuryAutoLp',
          };
          const txType = discMap[disc] || `disc:${disc}`;
          
          const wallet = ix.accounts && ix.accounts.length > 2 ? accounts[ix.accounts[2]]?.toBase58() : '?';
          const time = sig.blockTime ? new Date(sig.blockTime * 1000).toISOString().slice(11, 19) : '?';
          const errStr = sig.err ? JSON.stringify(sig.err).slice(0, 40) : 'OK';
          console.log(`${txType.padEnd(15)} | ${sig.signature.slice(0,16)}... | ${sig.slot} | ${time} | ${errStr} | ${wallet}`);
        }
      }
    } catch(e) {}
  }
  
  const slot = await conn.getSlot();
  console.log(`\nCurrent slot: ${slot}`);
}

main().catch(console.error);
