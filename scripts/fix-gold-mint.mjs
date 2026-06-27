import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMint2Instruction,
  getMintLen,
} from "@solana/spl-token";
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
const DECIMALS = 9;

// Step 1: Create new Token-2022 mint with GameConfig PDA as mint authority
const mintKeypair = Keypair.generate();
const mint = mintKeypair.publicKey;
console.log("New mint pubkey:", mint.toBase58());

const mintLen = getMintLen([]); // no extensions
const rentExempt = await connection.getMinimumBalanceForRentExemption(mintLen);

const createMintTx = new Transaction().add(
  SystemProgram.createAccount({
    fromPubkey: deployer.publicKey,
    newAccountPubkey: mint,
    space: mintLen,
    lamports: rentExempt,
    programId: TOKEN_2022,
  }),
  createInitializeMint2Instruction(
    mint,
    DECIMALS,
    GAME_CONFIG_PDA, // mint authority = game config PDA
    null,            // freeze authority = null
    TOKEN_2022
  )
);

try {
  const sig1 = await sendAndConfirmTransaction(connection, createMintTx, [deployer, mintKeypair], {
    commitment: "confirmed",
  });
  console.log("Mint created! Tx:", sig1);
} catch (e) {
  console.error("Failed to create mint:", e);
  process.exit(1);
}

// Save new mint info
const mintInfo = {
  network: "X1 Testnet",
  mint: mint.toBase58(),
  decimals: DECIMALS,
  name: "Goldium",
  symbol: "GOLD",
  mintAuthority: GAME_CONFIG_PDA.toBase58(),
  freezeAuthority: null,
  programId: PROGRAM_ID.toBase58(),
  deployer: deployer.publicKey.toBase58(),
  gameConfigPda: GAME_CONFIG_PDA.toBase58(),
  createdAt: new Date().toISOString(),
};
fs.writeFileSync(
  "/home/jack/newtheo/workspace-cyberdyne/gold-miner/scripts/gold-mint-v4-info.json",
  JSON.stringify(mintInfo, null, 2)
);
console.log("Saved mint info to gold-mint-v4-info.json");

// Step 2: Call updateGoldMint on-chain
// Discriminator: [240, 238, 95, 74, 241, 241, 128, 117]
const UPDATE_GOLD_MINT_DISC = Buffer.from([240, 238, 95, 74, 241, 241, 128, 117]);

// Accounts: authority (signer), gameConfig (writable), newGoldMint, tokenProgram, systemProgram
const updateGoldMintIx = {
  keys: [
    { pubkey: deployer.publicKey, isSigner: true, isWritable: false }, // authority
    { pubkey: GAME_CONFIG_PDA, isSigner: false, isWritable: true },    // gameConfig
    { pubkey: mint, isSigner: false, isWritable: true },                // newGoldMint (must be writable)
    { pubkey: TOKEN_2022, isSigner: false, isWritable: false },        // tokenProgram
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
  ],
  programId: PROGRAM_ID,
  data: UPDATE_GOLD_MINT_DISC,
};

const updateTx = new Transaction().add(updateGoldMintIx);

try {
  const sig2 = await sendAndConfirmTransaction(connection, updateTx, [deployer], {
    commitment: "confirmed",
  });
  console.log("updateGoldMint succeeded! Tx:", sig2);
} catch (e) {
  console.error("Failed to update gold mint:", e);
  process.exit(1);
}

console.log("\n=== DONE ===");
console.log("New GOLD mint:", mint.toBase58());
console.log("Mint creation tx:", sig1);
console.log("updateGoldMint tx:", sig2);
