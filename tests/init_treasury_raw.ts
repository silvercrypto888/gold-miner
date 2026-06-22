import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// Program ID
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");

// Game config PDA
const [gameConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("game_config")],
  PROGRAM_ID
);

// Treasury PDA
const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("treasury"), gameConfigPda.toBuffer()],
  PROGRAM_ID
);

async function main() {
  // Load wallet
  const walletPath = path.resolve(process.env.HOME || "/home/jack", ".config/solana/id.json");
  const walletSecret = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletSecret));

  const connection = new Connection("https://x1-testnet.xen.network", "confirmed");

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Game config PDA:", gameConfigPda.toBase58());
  console.log("Treasury PDA:", treasuryPda.toBase58());

  // Check if treasury already exists
  const treasuryInfo = await connection.getAccountInfo(treasuryPda);
  if (treasuryInfo) {
    console.log("Treasury already exists! Data length:", treasuryInfo.data.length);
    return;
  }

  console.log("Treasury does not exist yet, creating...");

  // Build init_treasury instruction
  // Anchor instruction discriminator for init_treasury: sha256("global:init_treasury")[0..8]
  const crypto = require("crypto");
  const discriminator = crypto.createHash("sha256").update("global:init_treasury").digest().slice(0, 8);
  console.log("Discriminator:", Array.from(discriminator).map(b => b.toString(16).padStart(2, "0")).join(""));

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
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
  console.log("Treasury initialized! TX:", sig);

  const treasuryInfo2 = await connection.getAccountInfo(treasuryPda);
  console.log("Treasury account exists:", !!treasuryInfo2);
  if (treasuryInfo2) {
    console.log("Data length:", treasuryInfo2.data.length);
  }
}

main().catch(console.error);
