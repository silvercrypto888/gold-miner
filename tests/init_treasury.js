const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");

const [gameConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("game_config")],
  PROGRAM_ID
);

const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("treasury"), gameConfigPda.toBuffer()],
  PROGRAM_ID
);

async function main() {
  const walletPath = path.resolve(process.env.HOME || "/home/jack", ".config/solana/id.json");
  const walletSecret = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletSecret));

  const connection = new Connection("https://x1-testnet.xen.network", "confirmed");

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Game config PDA:", gameConfigPda.toBase58());
  console.log("Treasury PDA:", treasuryPda.toBase58());

  const treasuryInfo = await connection.getAccountInfo(treasuryPda);
  if (treasuryInfo) {
    console.log("Treasury already exists! Data length:", treasuryInfo.data.length);
    return;
  }

  console.log("Treasury does not exist yet, creating...");

  const discriminator = crypto.createHash("sha256").update("global:init_treasury").digest().slice(0, 8);
  console.log("Discriminator hex:", Buffer.from(discriminator).toString("hex"));

  const data = Buffer.concat([discriminator]);

  const ix = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameConfigPda, isSigner: false, isWritable: true },
      { pubkey: treasuryPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  };

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  const blockhash = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash.blockhash;

  const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
  console.log("Treasury initialized! TX:", sig);

  const info = await connection.getAccountInfo(treasuryPda);
  console.log("Treasury account exists:", !!info);
  if (info) {
    console.log("Data length:", info.data.length);
    console.log("Raw data hex:", Buffer.from(info.data).toString("hex"));
  }
}

main().catch(console.error);
