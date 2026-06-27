const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");

const RPC = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const NEW_GOLD = new PublicKey("HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa");
const conn = new Connection(RPC, "confirmed");

const SILVER_WALLET = new PublicKey("A9kbMEknBao8YdMyqMLiUPkkArsr8TghGFQAtyZ3U8ZB");

async function main() {
  console.log("=== Silver's Player Account ===\n");
  
  const [playerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), SILVER_WALLET.toBuffer()],
    PROGRAM_ID
  );
  
  const playerInfo = await conn.getAccountInfo(playerPda);
  if (playerInfo) {
    console.log(`Player PDA: ${playerPda.toBase58()}`);
    console.log(`  Data length: ${playerInfo.data.length} bytes`);
    console.log(`  Owner: ${playerInfo.owner.toBase58()}`);
    
    // Parse Player struct:
    // wallet: Pubkey (32 bytes, offset 8 after discriminator)
    // session_key: Pubkey (32 bytes, offset 40)
    // position_x: u32 (4 bytes, offset 72)
    // position_y: u32 (4 bytes, offset 76)
    // goldium_minted: u64 (8 bytes, offset 80)
    // session_expires_at: u64 (8 bytes, offset 88)
    // bump: u8 (1 byte, offset 96)
    
    const wallet = new PublicKey(playerInfo.data.slice(8, 40));
    const sessionKey = new PublicKey(playerInfo.data.slice(40, 72));
    const posX = playerInfo.data.readUInt32LE(72);
    const posY = playerInfo.data.readUInt32LE(76);
    const goldMinted = playerInfo.data.readBigUInt64LE(80);
    const sessionExpires = playerInfo.data.readBigUInt64LE(88);
    const bump = playerInfo.data.readUInt8(96);
    
    console.log(`  Wallet: ${wallet.toBase58()}`);
    console.log(`  Session key: ${sessionKey.toBase58()}`);
    console.log(`  Position: (${posX}, ${posY})`);
    console.log(`  Goldium minted: ${goldMinted}`);
    console.log(`  Session expires at slot: ${sessionExpires}`);
    
    const currentSlot = BigInt(await conn.getSlot());
    console.log(`  Current slot: ${currentSlot}`);
    console.log(`  Session active: ${sessionExpires > currentSlot}`);
    console.log(`  Bump: ${bump}`);
    
    // Check if session key is valid (not default pubkey)
    const isDefault = sessionKey.toBase58() === "11111111111111111111111111111111";
    console.log(`  Session key set: ${!isDefault}`);
  } else {
    console.log(`Player PDA ${playerPda.toBase58()}: NOT FOUND`);
  }
  
  console.log("\n=== Token Accounts ===\n");
  
  // Check old GOLD ATA
  const oldAta = getAssociatedTokenAddressSync(
    new PublicKey("HRby9JcNp67dWCrdxwKyNohDu7WqoWmM9cbrodQCTEAq"),
    SILVER_WALLET, false, TOKEN_2022_PROGRAM_ID
  );
  const oldAtaInfo = await conn.getAccountInfo(oldAta);
  console.log(`Old GOLD ATA (${oldAta.toBase58()}): ${oldAtaInfo ? 'EXISTS' : 'NOT FOUND'}`);
  
  // Check new GOLD ATA
  const newAta = getAssociatedTokenAddressSync(NEW_GOLD, SILVER_WALLET, false, TOKEN_2022_PROGRAM_ID);
  const newAtaInfo = await conn.getAccountInfo(newAta);
  console.log(`New GOLD ATA (${newAta.toBase58()}): ${newAtaInfo ? 'EXISTS' : 'NOT FOUND'}`);
  
  if (!newAtaInfo) {
    console.log("\n❌ PROBLEM: New GOLD ATA does NOT exist!");
    console.log("Silver needs to run 'Join Game' again to create the new ATA,");
    console.log("OR we need to create it manually.");
  }
  
  // Check session key balance
  const playerInfoParsed = await conn.getAccountInfo(playerPda);
  if (playerInfoParsed) {
    const sessionKey = new PublicKey(playerInfoParsed.data.slice(40, 72));
    if (sessionKey.toBase58() !== "11111111111111111111111111111111") {
      const bal = await conn.getBalance(sessionKey);
      console.log(`\nSession key (${sessionKey.toBase58()}) balance: ${bal / 1e9} XN`);
      if (bal < 500_000) {
        console.log("⚠️  Session key is LOW on XNT (< 0.0005 XN)");
      }
    }
  }
  
  console.log("\n=== Recent Failed Transactions ===\n");
  
  // Check for failed transactions from Silver's wallet
  const sigs = await conn.getSignaturesForAddress(SILVER_WALLET, { limit: 20 });
  const failed = sigs.filter(s => s.err !== null);
  console.log(`Failed transactions: ${failed.length} / ${sigs.length}`);
  
  for (const f of failed.slice(0, 5)) {
    console.log(`  ${f.signature.slice(0,20)}... | slot ${f.slot} | ${JSON.stringify(f.err)}`);
    try {
      const tx = await conn.getTransaction(f.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (tx && tx.meta && tx.meta.logMessages) {
        const errLog = tx.meta.logMessages.find(l => l.includes("Error") || l.includes("error") || l.includes("require"));
        if (errLog) console.log(`    Log: ${errLog}`);
      }
    } catch(e) {}
  }
}

main().catch(console.error);
