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
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const NEW_GOLD_MINT = new PublicKey("HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa");

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
  );

  const [gameConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("game_config")], PROGRAM_ID);
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), gameConfigPda.toBuffer()], PROGRAM_ID
  );

  const treasuryGoldAta = getAssociatedTokenAddressSync(NEW_GOLD_MINT, treasuryPda, true, TOKEN_2022_PROGRAM_ID);

  console.log("Treasury PDA:", treasuryPda.toBase58());
  console.log("New GOLD mint:", NEW_GOLD_MINT.toBase58());
  console.log("Treasury GOLD ATA:", treasuryGoldAta.toBase58());

  // Check if ATA exists
  const info = await conn.getAccountInfo(treasuryGoldAta);
  if (info) {
    console.log("✅ ATA already exists");
    return;
  }

  console.log("Creating treasury GOLD ATA...");
  const ix = createAssociatedTokenAccountInstruction(
    payer.publicKey, // payer
    treasuryGoldAta, // associated token account
    treasuryPda,     // owner
    NEW_GOLD_MINT,   // mint
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
