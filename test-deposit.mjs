import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import fs from "fs";
import crypto from "crypto";

const RPC_URL = "https://rpc.mainnet.x1.xyz";
const PROGRAM_ID = new PublicKey("EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf");

// Compute discriminators both ways
function sighash(name) {
  const preimage = `global:${name}`;
  return Buffer.from(crypto.createHash("sha256").update(preimage).digest().subarray(0, 8));
}

const walletData = JSON.parse(fs.readFileSync("/home/jack/.config/solana/id.json", "utf-8"));
const payer = Keypair.fromSecretKey(Uint8Array.from(walletData));

const connection = new Connection(RPC_URL, "confirmed");

async function main() {
  const [playerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), payer.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  console.log(`Player PDA: ${playerPda.toBase58()}`);
  console.log(`Wallet: ${payer.publicKey.toBase58()}`);

  // Check if player exists
  const playerInfo = await connection.getAccountInfo(playerPda);
  if (!playerInfo) {
    console.log("Player doesn't exist yet. Need to join first.");
  } else {
    console.log(`Player account exists. Owner: ${playerInfo.owner.toBase58()}`);
    console.log(`Player data length: ${playerInfo.data.length}`);
    console.log(`Player data (hex): ${playerInfo.data.toString("hex").substring(0, 64)}...`);
  }

  // Try deposit with snake_case discriminator (Anchor on-chain)
  const disc = sighash("deposit_xnt");
  console.log(`deposit_xnt discriminator: 0x${disc.toString("hex")}`);
  
  // Amount: 0.02 SOL = 20_000_000 lamports
  const amount = 20_000_000n;
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigInt64LE(amount);
  
  const ixData = Buffer.concat([disc, amountBuf]);
  
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },  // wallet
      { pubkey: playerPda, isSigner: false, isWritable: true },       // player
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    programId: PROGRAM_ID,
    data: ixData,
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.add(ix);
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  console.log("\nSending deposit_xnt transaction...");
  try {
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
    });
    console.log(`TX: ${sig}`);
    const result = await connection.confirmTransaction(sig, "confirmed");
    console.log(`Result: ${JSON.stringify(result.value.err)}`);
  } catch (err) {
    console.log(`Error: ${err.message}`);
    // Try simulation for logs
    console.log("\nTrying simulation...");
    try {
      const sim = await connection.simulateTransaction(tx);
      console.log("Simulation logs:", sim.value.logs);
      if (sim.value.err) console.log("Simulation error:", sim.value.err);
    } catch (e2) {
      console.log("Simulation also failed:", e2.message);
    }
  }
}

main().catch(console.error);
