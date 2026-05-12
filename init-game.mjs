#!/usr/bin/env node
// Initialize Gold Miner game on X1 mainnet
// 1. Deploy the program (if not deployed)
// 2. Create Goldium mint (Token-2022)
// 3. Call initialize_game

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC_URL = "https://rpc.mainnet.x1.xyz";
const PROGRAM_ID = new PublicKey("EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf");

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  
  // Load payer keypair
  const keypairData = JSON.parse(fs.readFileSync("/home/jack/.config/solana/id.json", "utf-8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log(`Payer: ${payer.publicKey.toBase58()}`);
  
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // Check if program is already deployed
  const programAccountInfo = await connection.getAccountInfo(PROGRAM_ID);
  if (programAccountInfo) {
    console.log(`Program ${PROGRAM_ID.toBase58()} is already deployed`);
  } else {
    console.log(`Program not deployed. Deploying...`);
    // Deploy the program
    const programBuffer = fs.readFileSync(path.join(__dirname, "target/deploy/gold_miner.so"));
    console.log(`Program binary size: ${programBuffer.length} bytes`);
    
    const programKeypairData = JSON.parse(
      fs.readFileSync(path.join(__dirname, "target/deploy/gold_miner-keypair.json"), "utf-8")
    );
    const programKeypair = Keypair.fromSecretKey(Uint8Array.from(programKeypairData));
    console.log(`Program keypair: ${programKeypair.publicKey.toBase58()}`);
    
    // Calculate required lamports
    const programLen = programBuffer.length;
    const programDataSpace = programLen + 2; // 2 bytes for length prefix? Actually Solana uses specific layout
    
    // For Solana program accounts: space + overhead
    const space = programLen;
    const rentExempt = await connection.getMinimumBalanceForRentExemption(space);
    console.log(`Rent exempt for program: ${rentExempt / LAMPORTS_PER_SOL} SOL`);
    
    if (balance < rentExempt) {
      console.error(`Insufficient balance. Need at least ${rentExempt / LAMPORTS_PER_SOL} SOL`);
      process.exit(1);
    }

    // Use buffer deploy approach
    const [bufferPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("buffer"), PROGRAM_ID.toBuffer()],
      new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
    );
    
    console.log(`Deploying program via solana program deploy...`);
    // We'll use the CLI for deployment since web3.js program deploy is complex
    const { execSync } = await import("child_process");
    
    try {
      const result = execSync(
        `solana program deploy --url ${RPC_URL} target/deploy/gold_miner.so --program-id target/deploy/gold_miner-keypair.json`,
        {
          cwd: __dirname,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
      console.log(result);
    } catch (e) {
      console.error(`Deploy error: ${e.message}`);
      if (e.stdout) console.log(e.stdout);
      if (e.stderr) console.error(e.stderr);
      // Continue anyway - might already be deployed
    }
  }

  // Find game_config PDA
  const [gameConfigPda, gameConfigBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    PROGRAM_ID
  );
  console.log(`Game Config PDA: ${gameConfigPda.toBase58()} (bump: ${gameConfigBump})`);

  // Check if game_config already exists
  const configAccountInfo = await connection.getAccountInfo(gameConfigPda);
  if (configAccountInfo) {
    console.log(`Game config account already exists at ${gameConfigPda.toBase58()}`);
    console.log(`Data: ${JSON.stringify(configAccountInfo.data.slice(0, 32))}`);
    return;
  }

  // Create Goldium mint keypair
  const goldiumMint = Keypair.generate();
  console.log(`Goldium Mint: ${goldiumMint.publicKey.toBase58()}`);

  // Calculate rent for mint
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  console.log(`Mint rent: ${mintRent / LAMPORTS_PER_SOL} SOL`);

  // Calculate rent for game_config
  const GAME_CONFIG_SIZE = 8 + 32 + 4 + 32 + 8 + 8 + 1; // 93 bytes
  const configRent = await connection.getMinimumBalanceForRentExemption(GAME_CONFIG_SIZE);
  console.log(`Config rent: ${configRent / LAMPORTS_PER_SOL} SOL`);

  // Build transaction
  const tx = new Transaction();

  // 1. Create Goldium mint account
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: goldiumMint.publicKey,
      lamports: mintRent,
      space: MINT_SIZE,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  // 2. Initialize Goldium mint with game_config PDA as authority
  tx.add(
    createInitializeMint2Instruction(
      goldiumMint.publicKey,
      9, // decimals
      gameConfigPda, // mint authority
      null, // no freeze authority
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 3. Create game_config PDA via initialize_game instruction
  // We need to build the instruction manually since we don't have the IDL
  // initialize_game discriminator: first 8 bytes of sha256("global:initialize_game")
  const { createHash } = await import("crypto");
  const preimage = `global:initialize_game`;
  const hash = createHash("sha256").update(preimage).digest();
  const discriminator = hash.subarray(0, 8);
  console.log(`initialize_game discriminator: ${discriminator.toString("hex")}`);

  // Instruction data: just the 8-byte discriminator (no args)
  const ixData = Buffer.from(discriminator);

  // Build the instruction
  const ixKeys = [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },         // authority
    { pubkey: gameConfigPda, isSigner: false, isWritable: true },          // game_config
    { pubkey: goldiumMint.publicKey, isSigner: false, isWritable: true },  // goldium_mint
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
  ];

  const initGameIx = {
    keys: ixKeys,
    programId: PROGRAM_ID,
    data: ixData,
  };
  tx.add(initGameIx);

  // Send transaction
  console.log(`Sending transaction...`);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.partialSign(payer, goldiumMint);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  console.log(`Transaction sent: ${signature}`);
  console.log(`Waiting for confirmation...`);

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  if (confirmation.value.err) {
    console.error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    process.exit(1);
  }

  console.log(`✅ Game initialized successfully!`);
  console.log(`   Game Config: ${gameConfigPda.toBase58()}`);
  console.log(`   Goldium Mint: ${goldiumMint.publicKey.toBase58()}`);
  console.log(`   Authority: ${payer.publicKey.toBase58()}`);
  console.log(`   TX: https://explorer.mainnet.x1.xyz/tx/${signature}`);

  // Save the mint keypair for future reference
  const mintInfo = {
    mintAddress: goldiumMint.publicKey.toBase58(),
    gameConfigAddress: gameConfigPda.toBase58(),
    authority: payer.publicKey.toBase58(),
    txSignature: signature,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(__dirname, "goldium-mint-info.json"),
    JSON.stringify(mintInfo, null, 2)
  );
  console.log(`\nMint info saved to goldium-mint-info.json`);
  
  // IMPORTANT: Save the mint keypair!
  fs.writeFileSync(
    path.join(__dirname, "goldium-mint-keypair.json"),
    JSON.stringify(Array.from(goldiumMint.secretKey))
  );
  console.log(`⚠️  Mint keypair saved to goldium-mint-keypair.json - KEEP THIS SAFE!`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});