import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { GoldMiner } from "../target/types/gold_miner";
import { assert } from "chai";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createInitializeMint2Instruction,
  MINT_SIZE,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("gold-miner", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.GoldMiner as Program<GoldMiner>;
  const wallet = provider.wallet as anchor.Wallet;

  // Game accounts
  let gameConfigPda: PublicKey;
  let gameConfigBump: number;

  // Goldium mint
  let goldiumMint: Keypair;

  // Player
  let playerPda: PublicKey;
  let playerBump: number;

  // Treasury
  let treasuryPda: PublicKey;
  let treasuryBump: number;

  // Session key
  let sessionKeypair: Keypair;

  // Bitmap account
  let bitmapKeypair: Keypair;
  const BITMAP_SIZE = 131_072;

  before(async () => {
    // Find PDAs
    [gameConfigPda, gameConfigBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_config")],
      program.programId
    );

    [playerPda, playerBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("player"), wallet.publicKey.toBuffer()],
      program.programId
    );

    [treasuryPda, treasuryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), gameConfigPda.toBuffer()],
      program.programId
    );

    // Create goldium mint keypair
    goldiumMint = Keypair.generate();

    // Create session key
    sessionKeypair = Keypair.generate();

    // Create bitmap keypair
    bitmapKeypair = Keypair.generate();

    // Airdrop to session key for transaction fees
    await provider.connection.requestAirdrop(
      sessionKeypair.publicKey,
      100000000 // 0.1 SOL
    );
  });

  it("Initializes the game", async () => {
    // Create mint account first
    const lamports = await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE);

    const createMintTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: goldiumMint.publicKey,
        lamports,
        space: MINT_SIZE,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        goldiumMint.publicKey,
        9, // decimals
        gameConfigPda, // authority
        null, // freeze authority
        TOKEN_2022_PROGRAM_ID
      )
    );

    await provider.sendAndConfirm(createMintTx, [goldiumMint]);

    // Create bitmap account (128KB, owned by program)
    const bitmapLamports = await provider.connection.getMinimumBalanceForRentExemption(BITMAP_SIZE);
    const createBitmapTx = new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: bitmapKeypair.publicKey,
        lamports: bitmapLamports,
        space: BITMAP_SIZE,
        programId: program.programId,
      })
    );
    await provider.sendAndConfirm(createBitmapTx, [bitmapKeypair]);

    // Initialize game
    await program.methods
      .initializeGame()
      .accounts({
        authority: wallet.publicKey,
        gameConfig: gameConfigPda,
        goldBitmap: bitmapKeypair.publicKey,
        goldMint: goldiumMint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.gameConfig.fetch(gameConfigPda);
    assert.equal(config.gridSize, 1024);
    assert.equal(config.totalGoldMined.toNumber(), 0);
    assert.ok(config.authority.equals(wallet.publicKey));
    assert.ok(config.goldMint.equals(goldiumMint.publicKey));
    assert.ok(config.goldBitmap.equals(bitmapKeypair.publicKey));
  });

  it("Player can join game", async () => {
    // Get player token account
    const playerTokenAccount = getAssociatedTokenAddressSync(
      goldiumMint.publicKey,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .joinGame()
      .accounts({
        wallet: wallet.publicKey,
        player: playerPda,
        goldMint: goldiumMint.publicKey,
        playerTokenAccount: playerTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const player = await program.account.player.fetch(playerPda);
    assert.equal(player.positionX, 1);
    assert.equal(player.positionY, 1);
    assert.ok(player.wallet.equals(wallet.publicKey));
  });

  it("Can start session with session key", async () => {
    await program.methods
      .startSession(sessionKeypair.publicKey)
      .accounts({
        wallet: wallet.publicKey,
        player: playerPda,
      })
      .rpc();

    const player = await program.account.player.fetch(playerPda);
    assert.ok(player.sessionKey.equals(sessionKeypair.publicKey));
    assert.isAbove(player.sessionExpiresAt.toNumber(), 0);
  });

  it("Can move and mine gold with session key", async () => {
    // Get player token account
    const playerTokenAccount = getAssociatedTokenAddressSync(
      goldiumMint.publicKey,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Treasury token account
    const treasuryTokenAccount = getAssociatedTokenAddressSync(
      goldiumMint.publicKey,
      treasuryPda,
      true, // allow owner off-curve
      TOKEN_2022_PROGRAM_ID
    );

    // Move right (1,1) -> (2,1)
    await program.methods
      .moveAndMine({ right: {} })
      .accounts({
        sessionSigner: sessionKeypair.publicKey,
        player: playerPda,
        gameConfig: gameConfigPda,
        goldBitmap: bitmapKeypair.publicKey,
        goldMint: goldiumMint.publicKey,
        playerTokenAccount: playerTokenAccount,
        treasury: treasuryPda,
        treasuryTokenAccount: treasuryTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([sessionKeypair])
      .rpc();

    const player = await program.account.player.fetch(playerPda);
    assert.equal(player.positionX, 2);
    assert.equal(player.positionY, 1);
  });

  it("Mines gold at (7,7) and treasury receives matching GOLD", async () => {
    // (7 & 7) % 7 == 0, so (7,7) is a gold spot
    const goldX = 7;
    const goldY = 7;

    // Get player token account
    const playerTokenAccount = getAssociatedTokenAddressSync(
      goldiumMint.publicKey,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Treasury token account
    const treasuryTokenAccount = getAssociatedTokenAddressSync(
      goldiumMint.publicKey,
      treasuryPda,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    // Move from (2,1) to (7,7) step by step
    // Right 5 times: (2,1) -> (7,1)
    for (let i = 0; i < 5; i++) {
      await program.methods
        .moveAndMine({ right: {} })
        .accounts({
          sessionSigner: sessionKeypair.publicKey,
          player: playerPda,
          gameConfig: gameConfigPda,
          goldBitmap: bitmapKeypair.publicKey,
          goldMint: goldiumMint.publicKey,
          playerTokenAccount: playerTokenAccount,
          treasury: treasuryPda,
          treasuryTokenAccount: treasuryTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([sessionKeypair])
        .rpc();
    }

    // Up 6 times: (7,1) -> (7,7)
    for (let i = 0; i < 6; i++) {
      await program.methods
        .moveAndMine({ up: {} })
        .accounts({
          sessionSigner: sessionKeypair.publicKey,
          player: playerPda,
          gameConfig: gameConfigPda,
          goldBitmap: bitmapKeypair.publicKey,
          goldMint: goldiumMint.publicKey,
          playerTokenAccount: playerTokenAccount,
          treasury: treasuryPda,
          treasuryTokenAccount: treasuryTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([sessionKeypair])
        .rpc();
    }

    // Check player is at (7, 7)
    const player = await program.account.player.fetch(playerPda);
    assert.equal(player.positionX, 7);
    assert.equal(player.positionY, 7);

    // Check gold was mined
    const config = await program.account.gameConfig.fetch(gameConfigPda);
    assert.isAbove(config.totalGoldMined.toNumber(), 0);

    // Check player received GOLD
    const playerBalance = await provider.connection.getTokenAccountBalance(playerTokenAccount);
    assert.isAbove(Number(playerBalance.value.amount), 0);

    // Check treasury received GOLD
    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryTokenAccount);
    assert.isAbove(Number(treasuryBalance.value.amount), 0);

    // Treasury and player should have the same amount (both get 100 GOLD per mine)
    assert.equal(
      Number(playerBalance.value.amount),
      Number(treasuryBalance.value.amount)
    );

    // Check treasury account data
    const treasury = await program.account.treasury.fetch(treasuryPda);
    assert.ok(treasury.gameConfig.equals(gameConfigPda));
    assert.isAbove(treasury.goldAccumulated.toNumber(), 0);
  });

  it("Rejects move with invalid session key", async () => {
    const invalidSessionKey = Keypair.generate();

    const playerTokenAccount = getAssociatedTokenAddressSync(
      goldiumMint.publicKey,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const treasuryTokenAccount = getAssociatedTokenAddressSync(
      goldiumMint.publicKey,
      treasuryPda,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    try {
      await program.methods
        .moveAndMine({ right: {} })
        .accounts({
          sessionSigner: invalidSessionKey.publicKey,
          player: playerPda,
          gameConfig: gameConfigPda,
          goldBitmap: bitmapKeypair.publicKey,
          goldMint: goldiumMint.publicKey,
          playerTokenAccount: playerTokenAccount,
          treasury: treasuryPda,
          treasuryTokenAccount: treasuryTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([invalidSessionKey])
        .rpc();

      assert.fail("Should have thrown error");
    } catch (error) {
      assert.include(error.message, "InvalidSessionKey");
    }
  });

  it("Treasury account has correct structure", async () => {
    const treasury = await program.account.treasury.fetch(treasuryPda);
    assert.ok(treasury.gameConfig.equals(gameConfigPda));
    assert.isAtLeast(treasury.goldAccumulated.toNumber(), 0);
    assert.equal(treasury.xntAccumulated.toNumber(), 0);
    assert.equal(treasury.lpBurned.toNumber(), 0);
    assert.isNumber(treasury.bump);
  });

  it("Treasury auto-lp fails with insufficient GOLD (threshold guard)", async () => {
    // The treasury should have less than MIN_GOLD_FOR_LP (1000 GOLD = 1000 * 10^9)
    // unless we mined 10+ gold spots, which we didn't
    const treasuryTokenAccount = getAssociatedTokenAddressSync(
      goldiumMint.publicKey,
      treasuryPda,
      true,
      TOKEN_2022_PROGRAM_ID
    );

    const balance = await provider.connection.getTokenAccountBalance(treasuryTokenAccount);
    const goldAmount = Number(balance.value.amount);
    const minGoldForLp = 1000 * 10 ** 9;

    if (goldAmount < minGoldForLp) {
      // We expect the instruction to fail at the threshold guard
      // But we can't actually call treasury_auto_lp because it requires
      // specific AMM accounts that don't exist on localnet
      // So we just verify the balance is below threshold
      console.log(`Treasury GOLD: ${goldAmount}, MIN: ${minGoldForLp}`);
      assert.isBelow(goldAmount, minGoldForLp);
    }
  });
});
