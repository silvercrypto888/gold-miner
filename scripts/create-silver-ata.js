const {
  Connection, PublicKey, Transaction, sendAndConfirmTransaction, Keypair,
} = require("@solana/web3.js");
const {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");
const fs = require("fs");

const RPC = "https://rpc.testnet.x1.xyz";
const NEW_GOLD = new PublicKey("HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa");
const SILVER_WALLET = new PublicKey("A9kbMEknBao8YdMyqMLiUPkkArsr8TghGFQAtyZ3U8ZB");

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
  );

  const silverAta = getAssociatedTokenAddressSync(NEW_GOLD, SILVER_WALLET, false, TOKEN_2022_PROGRAM_ID);
  
  console.log("Silver wallet:", SILVER_WALLET.toBase58());
  console.log("New GOLD mint:", NEW_GOLD.toBase58());
  console.log("Silver's GOLD ATA:", silverAta.toBase58());

  // Check if ATA exists
  const info = await conn.getAccountInfo(silverAta);
  if (info) {
    console.log("✅ ATA already exists");
    return;
  }

  console.log("Creating Silver's GOLD ATA...");
  const ix = createAssociatedTokenAccountInstruction(
    payer.publicKey, // payer
    silverAta,     // associated token account
    SILVER_WALLET,   // owner
    NEW_GOLD,        // mint
    TOKEN_2022_PROGRAM_ID
  );

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [payer]);
  console.log("✅ Created! TX:", sig);
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
