const { AnchorProvider, Program, Wallet, web3 } = require("@coral-xyz/anchor");
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const fs = require("fs");

const RPC_URL = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = "GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6";
const NEW_GOLD_MINT = "9RThpUMiFo5ioaREZkJD5wd5VPr5peBYbX8212r1KkQB";

// Minimal IDL for updateGoldMint
const idl = {
  address: PROGRAM_ID,
  metadata: { name: "gold_miner", version: "0.2.0", spec: "0.1.0" },
  instructions: [
    {
      name: "updateGoldMint",
      discriminator: [240, 238, 95, 74, 241, 241, 128, 117],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "gameConfig", writable: true },
        { name: "newGoldMint", writable: true },
        { name: "tokenProgram", address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "initializeGame",
      discriminator: [44, 62, 102, 247, 126, 208, 130, 215],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "gameConfig", writable: true },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "GameConfig",
      discriminator: [45, 146, 146, 33, 170, 69, 96, 133],
    },
  ],
  types: [
    {
      name: "GameConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "pubkey" },
          { name: "gridSize", type: "u32" },
          { name: "goldMint", type: "pubkey" },
          { name: "totalGoldMined", type: "u64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
};

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  
  const keypairPath = process.env.HOME + "/.config/solana/id.json";
  const deployerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );
  console.log("Authority:", deployerKeypair.publicKey.toBase58());
  
  const wallet = new Wallet(deployerKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  
  const program = new Program(idl, provider);
  
  const [gameConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    new PublicKey(PROGRAM_ID)
  );
  console.log("GameConfig PDA:", gameConfigPda.toBase58());
  
  const config = await program.account.gameConfig.fetch(gameConfigPda);
  console.log("Current goldMint:", config.goldMint.toBase58());
  console.log("Expected new mint:", NEW_GOLD_MINT);
  
  if (config.goldMint.toBase58() === NEW_GOLD_MINT) {
    console.log("\n✅ goldMint is already set to the new mint. Nothing to do.");
    return;
  }
  
  const newGoldMintPubkey = new PublicKey(NEW_GOLD_MINT);
  
  console.log("\nCalling updateGoldMint...");
  const tx = await program.methods
    .updateGoldMint()
    .accounts({
      authority: deployerKeypair.publicKey,
      gameConfig: gameConfigPda,
      newGoldMint: newGoldMintPubkey,
      tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([deployerKeypair])
    .rpc({ commitment: "confirmed" });
  
  console.log("✅ updateGoldMint succeeded!");
  console.log("  Tx:", tx);
  
  // Verify
  const configAfter = await program.account.gameConfig.fetch(gameConfigPda);
  console.log("\nVerification:");
  console.log("  goldMint after:", configAfter.goldMint.toBase58());
  console.log("  Match:", configAfter.goldMint.toBase58() === NEW_GOLD_MINT ? "✅ YES" : "❌ NO");
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
