import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMint2Instruction,
} from "@solana/spl-token";
import fs from "fs";
import crypto from "crypto";

const RPC_URL = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = new PublicKey("EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf");

function sighash(name) {
  const preimage = `global:${name}`;
  return Buffer.from(crypto.createHash("sha256").update(preimage).digest().subarray(0, 8));
}

const walletData = JSON.parse(fs.readFileSync("/home/jack/.config/solana/id.json", "utf-8"));
const payer = Keypair.fromSecretKey(Uint8Array.from(walletData));

const connection = new Connection(RPC_URL, "confirmed");

async function main() {
  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);

  const [gameConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    PROGRAM_ID
  );
  console.log(`Game Config PDA: ${gameConfigPda.toBase58()}`);

  // Check if already initialized
  const existing = await connection.getAccountInfo(gameConfigPda);
  if (existing) {
    console.log("Game already initialized on testnet!");
    return;
  }

  // Create Goldium mint
  const goldiumMint = Keypair.generate();
  console.log(`Goldium Mint: ${goldiumMint.publicKey.toBase58()}`);

  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const configRent = await connection.getMinimumBalanceForRentExemption(93);

  const tx = new Transaction();

  // Create mint
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: goldiumMint.publicKey,
      lamports: mintRent,
      space: MINT_SIZE,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  // Initialize mint with game_config PDA as authority
  tx.add(
    createInitializeMint2Instruction(
      goldiumMint.publicKey,
      9,
      gameConfigPda,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // Initialize game instruction
  const ixData = sighash("initialize_game");
  tx.add({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameConfigPda, isSigner: false, isWritable: true },
      { pubkey: goldiumMint.publicKey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: ixData,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer, goldiumMint);

  console.log("\nSending transaction...");
  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log(`TX: ${sig}`);
  
  const result = await connection.confirmTransaction(sig, "confirmed");
  if (result.value.err) {
    console.error("Failed:", result.value.err);
  } else {
    console.log("✅ Game initialized on Testnet!");
    console.log(`   Game Config: ${gameConfigPda.toBase58()}`);
    console.log(`   Goldium Mint: ${goldiumMint.publicKey.toBase58()}`);
    
    // Save mint keypair
    fs.writeFileSync("goldium-mint-testnet-keypair.json", JSON.stringify(Array.from(goldiumMint.secretKey)));
    console.log("\n⚠️  Saved goldium-mint-testnet-keypair.json");
  }
}

main().catch(console.error);
