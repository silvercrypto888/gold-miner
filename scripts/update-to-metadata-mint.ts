import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ExtensionType,
  getMintLen,
  createInitializeMint2Instruction,
  createInitializeMetadataPointerInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
  createInitializeInstruction,
} from "@solana/spl-token-metadata";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";

// ── Configuration ──────────────────────────────────────────
const RPC_URL = "https://x1-testnet.xen.network";
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const CONFIG_PDA = new PublicKey("3cP6ffJRKwJ4FyoKa5Khg1tLZtoArVpfReLY3FxhXQJV");

// Load deployer keypair (authority)
const ID_JSON = path.join(homedir(), ".config", "solana", "id.json");
const idSecret = new Uint8Array(JSON.parse(fs.readFileSync(ID_JSON, "utf-8")));
const authority = Keypair.fromSecretKey(idSecret);
console.log("Authority:", authority.publicKey.toBase58());

const conn = new Connection(RPC_URL, "confirmed");

// ── Step 1: Create new GOLD mint with metadata ───────────
async function createMetadataMint(): Promise<Keypair> {
  const mint = Keypair.generate();
  console.log("\n=== Creating new mint:", mint.publicKey.toBase58(), "===");

  // Token-2022 metadata
  const metaName = "GOLD";
  const metaSymbol = "GOLD";
  const metaUri = "https://gold-miner.x1.xyz/metadata.json";

  // Space: basic mint + MetadataPointer extension
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  console.log("Mint space:", mintLen, "bytes (vs 82 plain)");

  const lamports = await conn.getMinimumBalanceForRentExemption(mintLen);

  // Build transaction
  const tx = new Transaction().add(
    // 1. Create account with extra space for extension
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),

    // 2. Initialize MetadataPointer (authority = wallet, metadata = mint itself)
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      authority.publicKey, // metadata update authority (wallet)
      mint.publicKey,        // metadata stored on the mint account itself
      TOKEN_2022_PROGRAM_ID
    ),

    // 3. Initialize mint (decimals=9, mint authority = CONFIG PDA so program can mint)
    createInitializeMint2Instruction(
      mint.publicKey,
      9,
      CONFIG_PDA,         // mint authority = config PDA (program can sign via PDA seeds)
      null,
      TOKEN_2022_PROGRAM_ID
    ),

    // 4. Initialize on-chain metadata (Token-2022 native, no Metaplex)
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: authority.publicKey,
      mint: mint.publicKey,
      mintAuthority: CONFIG_PDA, // must match mint authority above
      name: metaName,
      symbol: metaSymbol,
      uri: metaUri,
    })
  );

  const sig = await sendAndConfirmTransaction(conn, tx, [authority, mint], {
    commitment: "confirmed",
    skipPreflight: false,
  });
  console.log("✅ Mint created with metadata. Sig:", sig);

  // Verify
  const acct = await conn.getAccountInfo(mint.publicKey);
  console.log("  Account size:", acct?.data.length, "bytes (should be > 82)");
  console.log("  Owner:", acct?.owner.toBase58());

  return mint;
}

// ── Step 2: Call update_gold_mint via raw CPI ────────────
// Since we can't easily build the Anchor IDL client, we'll craft the IX manually
async function updateGoldMint(newMint: PublicKey) {
  console.log("\n=== Calling update_gold_mint ===");
  console.log("  Config PDA:", CONFIG_PDA.toBase58());
  console.log("  New mint:", newMint.toBase58());

  // Need instruction discriminator for update_gold_mint
  // Anchor derives this from sha256("global:update_gold_mint")[0:8]
  // Let's compute it
  const { createHash } = require("crypto");
  const hash = createHash("sha256");
  hash.update("global:update_gold_mint");
  const discriminator = hash.digest().subarray(0, 8);
  console.log("  Discriminator:", Buffer.from(discriminator).toString("hex"));

  // Build the instruction
  const ix = {
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },  // authority
      { pubkey: CONFIG_PDA, isSigner: false, isWritable: true },         // game_config
      { pubkey: newMint, isSigner: false, isWritable: true },             // new_gold_mint
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(discriminator), // no args for update_gold_mint
  };

  const tx = new Transaction().add(ix);
  tx.feePayer = authority.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  const sig = await sendAndConfirmTransaction(conn, tx, [authority], {
    commitment: "confirmed",
  });

  console.log("✅ Gold mint updated! Tx:", sig);
  return sig;
}

// ── Step 3: Verify config ────────────────────────────────
async function verifyConfig() {
  console.log("\n=== Verifying config ===");
  const acct = await conn.getAccountInfo(CONFIG_PDA);
  if (!acct) {
    console.log("Config account not found");
    return;
  }

  // Parse config
  const data = acct.data;
  const goldMintBytes = data.subarray(44, 76); // after discriminator(8) + authority(32) + grid_size(4)

  // Convert bytes to base58 pubkey
  // Simple base58 encoding
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt(0);
  for (let i = 0; i < goldMintBytes.length; i++) {
    num = (num << BigInt(8)) | BigInt(goldMintBytes[i]);
  }

  let result = "";
  while (num > 0n) {
    const rem = Number(num % 58n);
    result = alphabet[rem] + result;
    num = num / 58n;
  }
  // Add leading '1's for each leading zero byte
  for (const b of goldMintBytes) {
    if (b === 0) result = "1" + result;
    else break;
  }
  if (result === "") result = "1";

  console.log("  Current gold mint (from on-chain):", result);
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  // Step 1: Create new metadata-enabled mint
  const newMint = await createMetadataMint();

  // Step 2: Update config
  await updateGoldMint(newMint.publicKey);

  // Step 3: Verify
  await verifyConfig();

  // Save info
  const info = {
    newMint: newMint.publicKey.toBase58(),
    configPda: CONFIG_PDA.toBase58(),
    authority: authority.publicKey.toBase58(),
    timestamp: new Date().toISOString(),
    note: "Mint created with Token-2022 MetadataPointer extension + on-chain metadata",
  };
  fs.writeFileSync("gold-mint-metadata-v3.json", JSON.stringify(info, null, 2));
  console.log("\nSaved to: gold-mint-metadata-v3.json");
}

main().catch(console.error);
