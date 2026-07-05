import * as anchor from "@coral-xyz/anchor";
import {
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
} from "@solana/spl-token";
import {
  createInitializeInstruction,
  pack,
  Field,
} from "@solana/spl-token-metadata";

const conn = new anchor.web3.Connection("https://x1-testnet.xen.network", "confirmed");
const walletKeypair = anchor.web3.Keypair.fromSecretKey(
  new Uint8Array(require("fs").readFileSync("target/deploy/gold_miner-keypair.json", "utf-8"))
);
const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(walletKeypair), { commitment: "confirmed" });
anchor.setProvider(provider);
const wallet = provider.wallet;

async function getGameConfigPda(): Promise<PublicKey> {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    new PublicKey("4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM")
  );
  return pda;
}

async function main() {
  // Generate new mint keypair
  const mint = Keypair.generate();
  console.log("New mint:", mint.publicKey.toBase58());

  // Metadata
  const metaName = "GOLD";
  const metaSymbol = "GOLD";
  const metaUri = "https://gold-miner.x1.xyz/metadata.json";

  // Calculate required space for mint + metadata pointer extension
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  console.log("Mint space required:", mintLen, "bytes (vs 82 plain)");

  const lamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);

  // Build transaction
  const tx = new Transaction().add(
    // 1. Create account with extra space for MetadataPointer extension
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),

    // 2. Initialize MetadataPointer extension (authority = wallet, metadata = mint itself)
    createInitializeMetadataPointerInstruction(
      mint.publicKey,
      wallet.publicKey, // metadata update authority
      mint.publicKey,   // metadata address = the mint itself (on-chain metadata)
      TOKEN_2022_PROGRAM_ID
    ),

    // 3. Initialize the mint (decimals=9, mint authority = program's config or wallet)
    // NOTE: you can change authority later to the game config PDA if needed
    createInitializeMint2Instruction(
      mint.publicKey,
      9,
      wallet.publicKey, // mint authority
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 4. Initialize on-chain metadata (Token-2022 native, no Metaplex needed)
  const metaData = {
    updateAuthority: wallet.publicKey,
    mint: mint.publicKey,
    name: metaName,
    symbol: metaSymbol,
    uri: metaUri,
    additionalMetadata: [],
  };
  tx.add(
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: wallet.publicKey,
      mint: mint.publicKey,
      mintAuthority: wallet.publicKey,
      name: metaName,
      symbol: metaSymbol,
      uri: metaUri,
    })
  );

  const sig = await sendAndConfirmTransaction(
    provider.connection,
    tx,
    [mint],
    { commitment: "confirmed" }
  );

  console.log("Mint created + metadata initialized:");
  console.log("  Mint:", mint.publicKey.toBase58());
  console.log("  Signature:", sig);
  console.log("  Explorer:", `https://explorer.x1.xyz/address/${mint.publicKey.toBase58()}`);
}

main().catch(console.error);
