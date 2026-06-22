import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { GoldMiner } from "../target/types/gold_miner";
import { PublicKey, SystemProgram } from "@solana/web3.js";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.GoldMiner as Program<GoldMiner>;
  const wallet = provider.wallet as anchor.Wallet;

  const [gameConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("game_config")],
    program.programId
  );

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), gameConfigPda.toBuffer()],
    program.programId
  );

  console.log("Game config PDA:", gameConfigPda.toBase58());
  console.log("Treasury PDA:", treasuryPda.toBase58());

  // Check if treasury already exists
  try {
    const treasury = await program.account.treasury.fetch(treasuryPda);
    console.log("Treasury already exists:", treasury);
    return;
  } catch (e) {
    console.log("Treasury does not exist yet, creating...");
  }

  const tx = await program.methods
    .initTreasury()
    .accounts({
      authority: wallet.publicKey,
      gameConfig: gameConfigPda,
      treasury: treasuryPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("Treasury initialized! TX:", tx);

  const treasury = await program.account.treasury.fetch(treasuryPda);
  console.log("Treasury state:", treasury);
}

main().catch(console.error);
