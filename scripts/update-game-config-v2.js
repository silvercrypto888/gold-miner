const { AnchorProvider, Program, Wallet, web3 } = require("@coral-xyz/anchor");
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const fs = require("fs");

const RPC_URL = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = "GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6";
const NEW_GOLD_MINT = "HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa";

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
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8")))
  );
  
  const wallet = new Wallet(deployer);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl, provider);
  
  const [gameConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")], new PublicKey(PROGRAM_ID)
  );
  
  const config = await program.account.gameConfig.fetch(gameConfigPda);
  console.log("Current goldMint:", config.goldMint.toBase58());
  
  const newMintPubkey = new PublicKey(NEW_GOLD_MINT);
  
  const tx = await program.methods
    .updateGoldMint()
    .accounts({
      authority: deployer.publicKey,
      gameConfig: gameConfigPda,
      newGoldMint: newMintPubkey,
      tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      systemProgram: web3.SystemProgram.programId,
    })
    .signers([deployer])
    .rpc({ commitment: "confirmed" });
  
  console.log("✅ updateGoldMint TX:", tx);
  
  const configAfter = await program.account.gameConfig.fetch(gameConfigPda);
  console.log("New goldMint:", configAfter.goldMint.toBase58());
}

main().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
