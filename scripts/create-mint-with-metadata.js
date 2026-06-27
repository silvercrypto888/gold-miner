const {
  Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction,
  SystemProgram,
} = require("@solana/web3.js");
const {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  createUpdateMetadataPointerInstruction,
} = require("@solana/spl-token");
const { createInitializeInstruction } = require("@solana/spl-token-metadata");
const fs = require("fs");
const path = require("path");

const RPC = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const IPFS_METADATA_URI = "https://ipfs.io/ipfs/Qmb7HwNofuNDPmk56SjGGg5cYYzfjteKyF7NFYeTfUud2o";

const TOKEN_NAME = "Goldium";
const TOKEN_SYMBOL = "GOLD";
const TOKEN_URI = IPFS_METADATA_URI;

// Very generous size to avoid any size issues
const MINT_ACCOUNT_SIZE = 1000;

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(
      path.resolve(process.env.HOME, ".config/solana/id.json"), "utf-8")))
  );

  // GameConfig PDA = future mint authority
  const [gameConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")], PROGRAM_ID
  );

  console.log("Deployer:", deployer.publicKey.toBase58());
  console.log("GameConfig PDA (future mint auth):", gameConfigPda.toBase58());
  console.log("IPFS Metadata URI:", TOKEN_URI);

  // === Step 1: Create mint keypair ===
  const mintKeypair = Keypair.generate();
  console.log("\nNew mint pubkey:", mintKeypair.publicKey.toBase58());

  // Save keypair IMMEDIATELY
  const keypairPath = path.resolve(__dirname, `../goldium-mint-v2-keypair.json`);
  fs.writeFileSync(keypairPath, JSON.stringify(Array.from(mintKeypair.secretKey)));
  console.log("Keypair saved to:", keypairPath);

  // === Step 2: Build transaction ===
  const lamports = await conn.getMinimumBalanceForRentExemption(MINT_ACCOUNT_SIZE);
  console.log("Mint account size:", MINT_ACCOUNT_SIZE, "bytes");
  console.log("Rent exemption:", lamports, "lamports");

  const tx = new Transaction();

  // 2a. Create UNINITIALIZED account with sufficient size
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: deployer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_ACCOUNT_SIZE,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  // 2b. Initialize MetadataPointer extension (points to self)
  // NOTE: InitializeMetadataPointer must come BEFORE InitializeMint
  tx.add(
    createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,
      deployer.publicKey, // authority
      mintKeypair.publicKey, // metadata address (self-referencing)
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 2c. Initialize the base mint
  // With extensions already initialized, this should work
  tx.add(
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      9, // decimals
      deployer.publicKey, // mint authority
      null, // freeze authority
      TOKEN_2022_PROGRAM_ID
    )
  );

  // 2d. Initialize TokenMetadata (name, symbol, URI in mint account)
  tx.add(
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mintKeypair.publicKey,
      updateAuthority: deployer.publicKey,
      mint: mintKeypair.publicKey,
      mintAuthority: deployer.publicKey,
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      uri: TOKEN_URI,
    })
  );

  // 2e. Lock metadata pointer (set authority to None = immutable)
  tx.add(
    createUpdateMetadataPointerInstruction(
      mintKeypair.publicKey,
      deployer.publicKey, // current authority
      null, // new authority = None (immutable)
      mintKeypair.publicKey, // metadata address
      TOKEN_2022_PROGRAM_ID
    )
  );

  // === Step 3: Send transaction ===
  console.log("\nSending create + initialize transaction...");
  const sig = await sendAndConfirmTransaction(conn, tx, [deployer, mintKeypair]);
  console.log("TX:", sig);

  // === Step 4: Transfer mint authority to GameConfig PDA ===
  console.log("\nTransferring mint authority to GameConfig PDA...");
  const { createSetAuthorityInstruction, AuthorityType } = require("@solana/spl-token");

  const setAuthIx = createSetAuthorityInstruction(
    mintKeypair.publicKey,
    deployer.publicKey,
    AuthorityType.MintTokens,
    gameConfigPda,
    [],
    TOKEN_2022_PROGRAM_ID
  );

  const setAuthTx = new Transaction().add(setAuthIx);
  const setAuthSig = await sendAndConfirmTransaction(conn, setAuthTx, [deployer]);
  console.log("Authority transfer TX:", setAuthSig);

  // === Verification ===
  console.log("\n=== VERIFICATION ===");
  const mintInfo = await conn.getParsedAccountInfo(mintKeypair.publicKey);
  console.log("Mint account owner:", mintInfo.value?.owner);
  console.log("Mint data length:", mintInfo.value?.data.length);

  // Write deployment info
  const deployedInfo = {
    network: "X1 Testnet",
    mint: mintKeypair.publicKey.toBase58(),
    decimals: 9,
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    metadataUri: TOKEN_URI,
    ipfsJsonCid: "Qmb7HwNofuNDPmk56SjGGg5cYYzfjteKyF7NFYeTfUud2o",
    ipfsImageCid: "QmaB3aFyBBkcZNJvnsrxNEoT4ZTQTXCYrVeUkkVbf49opk",
    mintAuthority: gameConfigPda.toBase58(),
    freezeAuthority: null,
    programId: PROGRAM_ID.toBase58(),
    deployer: deployer.publicKey.toBase58(),
    createTx: sig,
    authorityTransferTx: setAuthSig,
    keypairFile: keypairPath,
    createdAt: new Date().toISOString(),
  };

  const infoPath = path.resolve(__dirname, `../goldium-mint-v2-info.json`);
  fs.writeFileSync(infoPath, JSON.stringify(deployedInfo, null, 2));
  console.log("\nDeployment info saved to:", infoPath);
  console.log(JSON.stringify(deployedInfo, null, 2));
}

main().catch(e => {
  console.error("ERROR:", e);
  process.exit(1);
});
