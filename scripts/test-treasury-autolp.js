// test-treasury-autolp.js — manually test treasuryAutoLp instruction
const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram, Keypair } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const RPC_URL = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");

// AMM addresses
const AMM_PROGRAM_ID = new PublicKey("7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf");
const AMM_MARKET_AUTHORITY = new PublicKey("2HbqjtA9gB9c95c8KkUUWxhtNjCfYcPbvfdhcdobbq1C");
const AMM_CONFIG = new PublicKey("3FzzbxwpdJKxRW1yNT7UPYmna17SwC9PRmskMa8A2BuY");
const AMM_POOL_STATE = new PublicKey("EJpboMDrMkoc3ZkTW6C8CnKuyP94rM9RuJyfFwr7TYij");
const AMM_GOLD_VAULT = new PublicKey("61tYCBnU5sXTPUdQgfMPLCZR15XkFH2LbNPe5G2T6MrD");
const AMM_XNT_VAULT = new PublicKey("3rs8Yj4GYqHWgXdAeap2L1W94Kj1Ga3YVkPswHGhv7ji");
const AMM_OBSERVER_STATE = new PublicKey("D32A8xrkDK1a6Yi8Lwc9RBV4F9ueKVrzxR751o5PRbA5");
const AMM_GOLD_MINT = new PublicKey("HRby9JcNp67dWCrdxwKyNohDu7WqoWmM9cbrodQCTEAq");
const AMM_XNT_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const AMM_LP_MINT = new PublicKey("4xvww8Yb8kAQAKxRBgsCCBgFBq8YEqKEKSjvTzrno8Rm");
const AMM_GOLD_TOKEN_PROG = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const AMM_XNT_TOKEN_PROG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const AMM_LP_TOKEN_PROG = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Discriminator: sha256("global:treasury_auto_lp")[0..8]
const TREASURY_AUTO_LP_DISC = Buffer.from([88, 214, 22, 127, 104, 230, 169, 225]);

// Derive PDAs
function getGameConfigPda() {
  return PublicKey.findProgramAddressSync([Buffer.from("game_config")], PROGRAM_ID);
}

function getTreasuryPda() {
  const [gameConfigPda] = getGameConfigPda();
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), gameConfigPda.toBuffer()],
    PROGRAM_ID
  );
}

function getTreasuryGoldAta(treasuryPda, goldMint) {
  return PublicKey.findProgramAddressSync(
    [treasuryPda.toBuffer(), AMM_GOLD_TOKEN_PROG.toBuffer(), goldMint.toBuffer()],
    ATA_PROGRAM_ID
  )[0];
}

function getTreasuryXntAta(treasuryPda) {
  return PublicKey.findProgramAddressSync(
    [treasuryPda.toBuffer(), AMM_XNT_TOKEN_PROG.toBuffer(), AMM_XNT_MINT.toBuffer()],
    ATA_PROGRAM_ID
  )[0];
}

function getTreasuryLpAta(treasuryPda) {
  return PublicKey.findProgramAddressSync(
    [treasuryPda.toBuffer(), AMM_LP_TOKEN_PROG.toBuffer(), AMM_LP_MINT.toBuffer()],
    ATA_PROGRAM_ID
  )[0];
}

async function main() {
  const conn = new Connection(RPC_URL, "confirmed");

  // Load deployer keypair (game_config authority)
  const keypairPath = process.env.SOLANA_KEYPAIR || path.join(process.env.HOME, ".config/solana/id.json");
  const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8"))));
  console.log("Authority:", deployer.publicKey.toBase58());

  const [gameConfigPda] = getGameConfigPda();
  const [treasuryPda] = getTreasuryPda();
  const treasuryGoldAta = getTreasuryGoldAta(treasuryPda, AMM_GOLD_MINT);
  const treasuryXntAta = getTreasuryXntAta(treasuryPda);
  const treasuryLpAta = getTreasuryLpAta(treasuryPda);

  console.log("gameConfigPda:", gameConfigPda.toBase58());
  console.log("treasuryPda:", treasuryPda.toBase58());
  console.log("treasuryGoldAta:", treasuryGoldAta.toBase58());
  console.log("treasuryXntAta:", treasuryXntAta.toBase58());
  console.log("treasuryLpAta:", treasuryLpAta.toBase58());

  // Check treasury GOLD balance
  try {
    const bal = await conn.getTokenAccountBalance(treasuryGoldAta);
    console.log("Treasury GOLD balance:", bal.value.uiAmountString);
  } catch (e) {
    console.log("Treasury GOLD ATA not found or empty:", e.message);
  }

  const data = Buffer.concat([TREASURY_AUTO_LP_DISC]);

  const keys = [
    { pubkey: deployer.publicKey, isSigner: true, isWritable: false },   // authority
    { pubkey: gameConfigPda, isSigner: false, isWritable: true },         // game_config
    { pubkey: treasuryPda, isSigner: false, isWritable: true },           // treasury
    { pubkey: AMM_PROGRAM_ID, isSigner: false, isWritable: false },       // amm_program
    { pubkey: AMM_MARKET_AUTHORITY, isSigner: false, isWritable: true },  // market_authority
    { pubkey: AMM_CONFIG, isSigner: false, isWritable: true },             // amm_config
    { pubkey: AMM_POOL_STATE, isSigner: false, isWritable: true },       // pool_state
    { pubkey: AMM_GOLD_VAULT, isSigner: false, isWritable: true },       // gold_vault
    { pubkey: AMM_XNT_VAULT, isSigner: false, isWritable: true },       // xnt_vault
    { pubkey: AMM_OBSERVER_STATE, isSigner: false, isWritable: true },    // observer_state
    { pubkey: treasuryGoldAta, isSigner: false, isWritable: true },       // treasury_gold_ata
    { pubkey: treasuryXntAta, isSigner: false, isWritable: true },       // treasury_xnt_ata
    { pubkey: treasuryLpAta, isSigner: false, isWritable: true },         // treasury_lp_ata
    { pubkey: AMM_GOLD_MINT, isSigner: false, isWritable: false },       // gold_mint
    { pubkey: AMM_XNT_MINT, isSigner: false, isWritable: false },         // xnt_mint
    { pubkey: AMM_LP_MINT, isSigner: false, isWritable: true },           // lp_mint
    { pubkey: AMM_GOLD_TOKEN_PROG, isSigner: false, isWritable: false }, // gold_token_prog
    { pubkey: AMM_XNT_TOKEN_PROG, isSigner: false, isWritable: false },  // xnt_token_prog
    { pubkey: AMM_LP_TOKEN_PROG, isSigner: false, isWritable: false },   // lp_token_prog
    { pubkey: ATA_PROGRAM_ID, isSigner: false, isWritable: false },       // associated_token_program
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
  ];

  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
  tx.add(ix);

  const blockhash = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash.blockhash;
  tx.lastValidBlockHeight = blockhash.lastValidBlockHeight;
  tx.feePayer = deployer.publicKey;

  console.log("\n=== Simulating transaction ===");
  try {
    const sim = await conn.simulateTransaction(tx, [deployer]);
    if (sim.value.err) {
      console.error("Simulation FAILED:");
      console.error("Error:", JSON.stringify(sim.value.err, null, 2));
      console.error("Logs:");
      (sim.value.logs || []).forEach(l => console.error("  ", l));
      process.exit(1);
    } else {
      console.log("✅ Simulation SUCCEEDED!");
      console.log("Logs:");
      (sim.value.logs || []).forEach(l => console.log("  ", l));
      console.log("\n=== Sending transaction ===");
      tx.sign(deployer);
      const sig = await conn.sendRawTransaction(tx.serialize());
      console.log("TX sent:", sig);
      await conn.confirmTransaction(sig);
      console.log("✅ Transaction CONFIRMED!");
    }
  } catch (e) {
    console.error("Error:", e.message);
    if (e.logs) {
      console.error("Logs:");
      e.logs.forEach(l => console.error("  ", l));
    }
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
