const {
  Connection, PublicKey, Transaction, sendAndConfirmTransaction, Keypair,
} = require("@solana/web3.js");
const {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} = require("@solana/spl-token");
const fs = require("fs");

const RPC = "https://rpc.testnet.x1.xyz";
const NEW_LP_MINT = new PublicKey("4uQeVvV83A6y8iA5PmeydTybhLpJpMNzFxK6jEJdDCj");
const TREASURY_PDA = new PublicKey("8NK7dBvzJ9MmTDWjfX3AAW2fkWGewNsGsqE2HWf847Wv");
const TOKENKEG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
  );

  const lpAta = getAssociatedTokenAddressSync(NEW_LP_MINT, TREASURY_PDA, true, TOKENKEG);
  
  console.log("Treasury PDA:", TREASURY_PDA.toBase58());
  console.log("New LP mint:", NEW_LP_MINT.toBase58());
  console.log("Treasury LP ATA:", lpAta.toBase58());

  const info = await conn.getAccountInfo(lpAta);
  if (info) {
    console.log("✅ LP ATA already exists");
    return;
  }

  console.log("Creating treasury LP ATA...");
  const ix = createAssociatedTokenAccountInstruction(
    payer.publicKey,
    lpAta,
    TREASURY_PDA,
    NEW_LP_MINT,
    TOKENKEG
  );

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(conn, tx, [payer]);
  console.log("✅ Created! TX:", sig);
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
