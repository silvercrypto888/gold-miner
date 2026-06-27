const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");

const RPC = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const OLD_GOLD = new PublicKey("HRby9JcNp67dWCrdxwKyNohDu7WqoWmM9cbrodQCTEAq");
const NEW_GOLD = new PublicKey("HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa");

const conn = new Connection(RPC, "confirmed");

async function main() {
  // We need to find Silver's wallet. Let's get it from a recent joinGame or moveAndMine tx
  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 30 });
  
  let wallet = null;
  for (const sig of sigs) {
    try {
      const tx = await conn.getTransaction(sig.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
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
          // joinGame disc = 17e36f8ed4e603af
          if (disc === '17e36f8ed4e603af') {
            // In joinGame, wallet is accounts[2] (authority/owner)
            wallet = accounts[ix.accounts[2]].toBase58();
            console.log(`Found wallet from joinGame: ${wallet}`);
            break;
          }
          // moveAndMine disc = 1acae43fce04893f
          if (disc === '1acae43fce04893f') {
            // In moveAndMine, wallet is accounts[9] (session_key)
            // Actually wallet is accounts[2] in the instruction
            wallet = accounts[ix.accounts[2]].toBase58();
            console.log(`Found wallet from moveAndMine: ${wallet}`);
            break;
          }
        }
      }
      if (wallet) break;
    } catch(e) {}
  }
  
  if (!wallet) {
    console.log("No wallet found in recent transactions");
    return;
  }
  
  const walletPk = new PublicKey(wallet);
  
  // Derive player PDA
  const [playerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), walletPk.toBuffer()], 
    PROGRAM_ID
  );
  
  // Check player account
  const playerInfo = await conn.getAccountInfo(playerPda);
  if (playerInfo) {
    console.log(`\nPlayer PDA: ${playerPda.toBase58()}`);
    console.log(`  Position X: ${playerInfo.data.readUInt32LE(72)}`);
    console.log(`  Position Y: ${playerInfo.data.readUInt32LE(76)}`);
    console.log(`  Goldium minted: ${playerInfo.data.readBigUInt64LE(80)}`);
    const sessionKey = new PublicKey(playerInfo.data.slice(40, 72));
    console.log(`  Session key: ${sessionKey.toBase58()}`);
    const sessionExpires = playerInfo.data.readBigUInt64LE(88);
    console.log(`  Session expires at slot: ${sessionExpires}`);
    const currentSlot = BigInt(await conn.getSlot());
    console.log(`  Current slot: ${currentSlot}`);
    console.log(`  Session active: ${sessionExpires > currentSlot}`);
  }
  
  // Check old GOLD ATA
  const oldAta = getAssociatedTokenAddressSync(OLD_GOLD, walletPk, false, TOKEN_2022_PROGRAM_ID);
  const oldAtaInfo = await conn.getAccountInfo(oldAta);
  console.log(`\nOld GOLD ATA (${oldAta.toBase58()}): ${oldAtaInfo ? 'EXISTS' : 'NOT FOUND'}`);
  
  // Check new GOLD ATA
  const newAta = getAssociatedTokenAddressSync(NEW_GOLD, walletPk, false, TOKEN_2022_PROGRAM_ID);
  const newAtaInfo = await conn.getAccountInfo(newAta);
  console.log(`New GOLD ATA (${newAta.toBase58()}): ${newAtaInfo ? 'EXISTS' : 'NOT FOUND'}`);
  
  if (!newAtaInfo) {
    console.log("\n❌ PROBLEM: New GOLD ATA does NOT exist!");
    console.log("When JoinGame was called, the gold_mint was OLD_GOLD.");
    console.log("JoinGame created the ATA for OLD_GOLD.");
    console.log("Now moveAndMine needs NEW_GOLD ATA, but it was never created!");
    console.log("\nFix: Create the new GOLD ATA for this wallet.");
  }
}

main().catch(console.error);
