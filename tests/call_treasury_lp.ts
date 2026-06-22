import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

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

// AMM constants (from lib.rs)
const AMM_PROGRAM_ID = new PublicKey("7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf");
const MARKET_AUTHORITY = new PublicKey("2HbqjtA9gB9c95c8KkUUWxhtNjCfYcPbvfdhcdobbq1C");
const AMM_CONFIG = new PublicKey("3FzzbxwpdJKxRW1yNT7UPYmna17SwC9PRmskMa8A2BuY");
const POOL_STATE = new PublicKey("CdD9sutJxR1nSRkUyHkYyDxo9D63JJcyiSuPVatDwFMt");
const GOLD_VAULT = new PublicKey("5mCfZdbYfUyYHwVLdDQwnAEv6YJgiGi2dihfrEuv3AYx");
const XNT_VAULT = new PublicKey("BBwRY3cCMyW524bgBoUheA8Tae6GtVKPKivz67xWGibH");
const OBSERVER_STATE = new PublicKey("DXf6rW8E5wnMGYFMjhJPjL1aKNh8eAfwmLBqAkGF7t7v");
const GOLD_MINT = new PublicKey("HRby9JcNp67dWCrdxwKyNohDu7WqoWmM9cbrodQCTEAq");
const XNT_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const LP_MINT = new PublicKey("cWf87wGwVpv1TfMac8PimFmEPi1W4WqguFi2vEWQqkL");
const GOLD_TOKEN_PROG = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const XNT_TOKEN_PROG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const LP_TOKEN_PROG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const INCINERATOR = new PublicKey("1nc1nerator11111111111111111111111111111111");

// Treasury token accounts
const treasuryGoldAta = getAssociatedTokenAddressSync(GOLD_MINT, treasuryPda, true, GOLD_TOKEN_PROG);
const treasuryXntAta = getAssociatedTokenAddressSync(XNT_MINT, treasuryPda, true, XNT_TOKEN_PROG);
const treasuryLpAta = getAssociatedTokenAddressSync(LP_MINT, treasuryPda, true, LP_TOKEN_PROG);

// Incinerator LP ATA
const incineratorLpAta = getAssociatedTokenAddressSync(LP_MINT, INCINERATOR, true, LP_TOKEN_PROG);

async function main() {
  const walletPath = path.resolve(process.env.HOME || "/home/jack", ".config/solana/id.json");
  const walletSecret = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletSecret));

  const connection = new Connection("https://x1-testnet.xen.network", "confirmed");

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Treasury:", treasuryPda.toBase58());
  console.log("Treasury GOLD ATA:", treasuryGoldAta.toBase58());
  console.log("Treasury XNT ATA:", treasuryXntAta.toBase58());
  console.log("Treasury LP ATA:", treasuryLpAta.toBase58());
  console.log("Incinerator LP ATA:", incineratorLpAta.toBase58());

  // Check incinerator LP ATA exists, create if not
  try {
    await connection.getTokenAccountBalance(incineratorLpAta);
  } catch {
    console.log("Creating incinerator LP ATA...");
    const createIx = {
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: incineratorLpAta, isSigner: false, isWritable: true },
        { pubkey: INCINERATOR, isSigner: false, isWritable: false },
        { pubkey: LP_MINT, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([0]), // AssociatedTokenAccount instruction
    };
    // Actually need to use the ATA program
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xr25ix9fJh4Xq1N5k");
    const createAtaIx = {
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: incineratorLpAta, isSigner: false, isWritable: true },
        { pubkey: INCINERATOR, isSigner: false, isWritable: false },
        { pubkey: LP_MINT, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([]),
    };
    const tx = new Transaction().add(createAtaIx);
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
    console.log("Incinerator LP ATA created:", sig);
  }

  // Build treasury_auto_lp instruction
  const discriminator = createHash("sha256").update("global:treasury_auto_lp").digest().slice(0, 8);
  console.log("Discriminator:", Array.from(discriminator).map(b => "0x" + b.toString(16).padStart(2, "0")).join(" "));

  const data = Buffer.concat([discriminator]);

  const ix = {
    programId: PROGRAM_ID,
    keys: [
      // authority (signer)
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      // game_config
      { pubkey: gameConfigPda, isSigner: false, isWritable: true },
      // treasury
      { pubkey: treasuryPda, isSigner: false, isWritable: true },
      // amm_program
      { pubkey: AMM_PROGRAM_ID, isSigner: false, isWritable: false },
      // market_authority
      { pubkey: MARKET_AUTHORITY, isSigner: false, isWritable: true },
      // amm_config
      { pubkey: AMM_CONFIG, isSigner: false, isWritable: true },
      // pool_state
      { pubkey: POOL_STATE, isSigner: false, isWritable: true },
      // gold_vault
      { pubkey: GOLD_VAULT, isSigner: false, isWritable: true },
      // xnt_vault
      { pubkey: XNT_VAULT, isSigner: false, isWritable: true },
      // observer_state
      { pubkey: OBSERVER_STATE, isSigner: false, isWritable: true },
      // treasury_gold_ata
      { pubkey: treasuryGoldAta, isSigner: false, isWritable: true },
      // treasury_xnt_ata
      { pubkey: treasuryXntAta, isSigner: false, isWritable: true },
      // treasury_lp_ata
      { pubkey: treasuryLpAta, isSigner: false, isWritable: true },
      // gold_mint
      { pubkey: GOLD_MINT, isSigner: false, isWritable: false },
      // xnt_mint
      { pubkey: XNT_MINT, isSigner: false, isWritable: false },
      // lp_mint
      { pubkey: LP_MINT, isSigner: false, isWritable: true },
      // gold_token_prog
      { pubkey: GOLD_TOKEN_PROG, isSigner: false, isWritable: false },
      // xnt_token_prog
      { pubkey: XNT_TOKEN_PROG, isSigner: false, isWritable: false },
      // lp_token_prog
      { pubkey: LP_TOKEN_PROG, isSigner: false, isWritable: false },
      // incinerator_ata
      { pubkey: incineratorLpAta, isSigner: false, isWritable: true },
      // associated_token_program
      { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xr25ix9fJh4Xq1N5k"), isSigner: false, isWritable: false },
      // system_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  };

  console.log("Calling treasury_auto_lp...");
  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet], { skipPreflight: false, commitment: "confirmed" });
    console.log("SUCCESS! TX:", sig);
  } catch (err) {
    console.error("FAILED:", err.message || err);
    if (err.logs) {
      console.log("Logs:");
      err.logs.forEach((l: string) => console.log("  ", l));
    }
  }
}

main().catch(console.error);
