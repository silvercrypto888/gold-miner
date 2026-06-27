import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";

const RPC_URL = "https://x1-testnet.xen.network";
const connection = new Connection(RPC_URL, "confirmed");

// Load deployer keypair
const deployerSecret = JSON.parse(fs.readFileSync("/home/jack/.config/solana/id.json", "utf-8"));
const deployer = Keypair.fromSecretKey(Uint8Array.from(deployerSecret));
console.log("Deployer:", deployer.publicKey.toBase58());

// Constants
const GAME_CONFIG_PDA = new PublicKey("9goAYzVfp19iydL1AvdzB5jF1o6gtV24vUoCqamLHctX");
const PROGRAM_ID = new PublicKey("4GkZ3snMDedRn9BRvUtH1rx24AqzpDCZj7VP7WXGfZUr");
const TOKEN_2022 = TOKEN_2022_PROGRAM_ID;

// Read the newly created mint
const mintInfo = JSON.parse(fs.readFileSync("/home/jack/newtheo/workspace-cyberdyne/gold-miner/scripts/gold-mint-v4-info.json", "utf-8"));
const mint = new PublicKey(mintInfo.mint);
console.log("Updating game_config to use mint:", mint.toBase58());

// Call updateGoldMint on-chain
// Discriminator: [240, 238, 95, 74, 241, 241, 128, 117]
const UPDATE_GOLD_MINT_DISC = Buffer.from([240, 238, 95, 74, 241, 241, 128, 117]);

// Accounts: authority (signer), gameConfig (writable), newGoldMint (writable), tokenProgram, systemProgram
const updateGoldMintIx = {
  keys: [
    { pubkey: deployer.publicKey, isSigner: true, isWritable: false }, // authority
    { pubkey: GAME_CONFIG_PDA, isSigner: false, isWritable: true },    // gameConfig
    { pubkey: mint, isSigner: false, isWritable: true },               // newGoldMint
    { pubkey: TOKEN_2022, isSigner: false, isWritable: false },        // tokenProgram
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
  ],
  programId: PROGRAM_ID,
  data: UPDATE_GOLD_MINT_DISC,
};

const updateTx = new Transaction().add(updateGoldMintIx);

try {
  const sig = await sendAndConfirmTransaction(connection, updateTx, [deployer], {
    commitment: "confirmed",
  });
  console.log("updateGoldMint succeeded! Tx:", sig);
} catch (e) {
  console.error("Failed to update gold mint:", e);
  process.exit(1);
}
