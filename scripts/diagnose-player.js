const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const GOLD_MINT = new PublicKey("HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa");

// Get recent signatures for the program to find active players
async function main() {
  const conn = new Connection(RPC, "confirmed");
  
  // Get recent confirmed signatures for the program
  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 20 });
  console.log("Recent program transactions:");
  for (const sig of sigs) {
    console.log(`  ${sig.signature} | ${sig.err ? 'FAILED: ' + JSON.stringify(sig.err) : 'OK'} | ${new Date(sig.blockTime * 1000).toISOString()}`);
  }
  
  // Check game config
  const [gameConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("game_config")], PROGRAM_ID);
  const config = await conn.getAccountInfo(gameConfigPda);
  console.log(`\nGameConfig PDA: ${gameConfigPda.toBase58()}`);
  console.log(`  Exists: ${config !== null}`);
  if (config) {
    console.log(`  Data length: ${config.data.length} bytes`);
    console.log(`  Owner: ${config.owner.toBase58()}`);
  }
  
  // Get recent failed transactions specifically
  const failed = sigs.filter(s => s.err !== null);
  console.log(`\nFailed transactions in last 20: ${failed.length}`);
  if (failed.length > 0) {
    for (const f of failed.slice(0, 5)) {
      console.log(`  ${f.signature}: ${JSON.stringify(f.err)}`);
    }
  }
}

main().catch(console.error);
