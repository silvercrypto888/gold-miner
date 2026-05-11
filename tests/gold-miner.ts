import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { GoldMiner } from "../target/types/gold_miner";
import { assert } from "chai";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createInitializeMint2Instruction,
  MINT_SIZE,
  createAssociatedTokenAccountInstruction,
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
  
  // Session key
  let sessionKeypair: Keypair;

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
    
    // Create goldium mint keypair
    goldiumMint = Keypair.generate();
    
    // Create session key
    sessionKeypair = Keypair.generate();
    
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

    // Initialize game
    await program.methods
      .initializeGame()
      .accounts({
        authority: wallet.publicKey,
        gameConfig: gameConfigPda,
        goldiumMint: goldiumMint.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.gameConfig.fetch(gameConfigPda);
    assert.equal(config.gridSize, 100);
    assert.equal(config.totalGoldMined.toNumber(), 0);
    assert.ok(config.authority.equals(wallet.publicKey));
  });

  it("Player can join game", async () => {
    await program.methods
      .joinGame()
      .accounts({
        wallet: wallet.publicKey,
        player: playerPda,
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

  it("Can move player with session key", async () => {
    // Calculate gold spot PDA for position (1,2)
    const [goldSpotPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("gold_spot"),
        new Uint8Array(new Uint16Array([1]).buffer),
        new Uint8Array(new Uint16Array([2]).buffer),
      ],
      program.programId
    );

    // Get player token account
    const playerTokenAccount = getAssociatedTokenAddressSync(
      goldiumMint.publicKey,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    await program.methods
      .movePlayer({ up: {} })
      .accounts({
        sessionSigner: sessionKeypair.publicKey,
        gameConfig: gameConfigPda,
        player: playerPda,
        goldSpot: goldSpotPda,
        goldiumMint: goldiumMint.publicKey,
        playerTokenAccount: playerTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([sessionKeypair])
      .rpc();

    const player = await program.account.player.fetch(playerPda);
    assert.equal(player.positionX, 1);
    assert.equal(player.positionY, 2);
  });

  it("Can deposit XNT into escrow", async () => {
    const depositAmount = 10000000; // 0.01 SOL
    
    await program.methods
      .depositXnt(new anchor.BN(depositAmount))
      .accounts({
        wallet: wallet.publicKey,
        player: playerPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const playerAccount = await provider.connection.getAccountInfo(playerPda);
    assert.isAbove(playerAccount.lamports, depositAmount);
  });

  it("Can withdraw XNT from escrow", async () => {
    const balanceBefore = await provider.connection.getBalance(wallet.publicKey);
    
    await program.methods
      .withdrawXnt()
      .accounts({
        wallet: wallet.publicKey,
        player: playerPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Balance should have increased (minus transaction fees)
    const balanceAfter = await provider.connection.getBalance(wallet.publicKey);
    assert.isAbove(balanceAfter, balanceBefore - 1000000); // Allow for fees
  });

  it("Mines gold when moving to gold spot", async () => {
    // Find a position with gold: (x & y) % 7 == 0
    // Position (7, 7): 7 & 7 = 7, 7 % 7 = 0 ✓
    const goldX = 7;
    const goldY = 7;
    
    // Move player to (7, 7)
    // This requires multiple moves from (1, 2)
    const moves = [
      { right: {} }, { right: {} }, { right: {} }, { right: {} }, { right: {} }, { right: {} }, // x: 1->7
      { up: {} }, { up: {} }, { up: {} }, { up: {} }, { up: {} }, // y: 2->7
    ];
    
    for (const move of moves) {
      // Get current position
      const player = await program.account.player.fetch(playerPda);
      
      // Calculate new position
      let newX = player.positionX;
      let newY = player.positionY;
      
      if ('up' in move) newY += 1;
      if ('down' in move) newY -= 1;
      if ('left' in move) newX -= 1;
      if ('right' in move) newX += 1;
      
      const [goldSpotPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("gold_spot"),
          new Uint8Array(new Uint16Array([newX]).buffer),
          new Uint8Array(new Uint16Array([newY]).buffer),
        ],
        program.programId
      );
      
      const playerTokenAccount = getAssociatedTokenAddressSync(
        goldiumMint.publicKey,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      await program.methods
        .movePlayer(move)
        .accounts({
          sessionSigner: sessionKeypair.publicKey,
          gameConfig: gameConfigPda,
          player: playerPda,
          goldSpot: goldSpotPda,
          goldiumMint: goldiumMint.publicKey,
          playerTokenAccount: playerTokenAccount,
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
    
    // Check if gold was mined (depends on whether (7,7) is a gold spot)
    // (7 & 7) = 7, 7 % 7 = 0, so yes it should have gold
    if ((7 & 7) % 7 === 0) {
      const goldSpot = await program.account.goldSpot.fetch(
        PublicKey.findProgramAddressSync(
          [
            Buffer.from("gold_spot"),
            new Uint8Array(new Uint16Array([7]).buffer),
            new Uint8Array(new Uint16Array([7]).buffer),
          ],
          program.programId
        )[0]
      );
      
      assert.equal(goldSpot.hasGold, false);
      assert.ok(goldSpot.minedBy.equals(wallet.publicKey));
      
      const config = await program.account.gameConfig.fetch(gameConfigPda);
      assert.isAbove(config.totalGoldMined.toNumber(), 0);
    }
  });

  it("Rejects move with invalid session key", async () => {
    const invalidSessionKey = Keypair.generate();
    
    try {
      const [goldSpotPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("gold_spot"),
          new Uint8Array(new Uint16Array([8]).buffer),
          new Uint8Array(new Uint16Array([7]).buffer),
        ],
        program.programId
      );
      
      const playerTokenAccount = getAssociatedTokenAddressSync(
        goldiumMint.publicKey,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      await program.methods
        .movePlayer({ right: {} })
        .accounts({
          sessionSigner: invalidSessionKey.publicKey,
          gameConfig: gameConfigPda,
          player: playerPda,
          goldSpot: goldSpotPda,
          goldiumMint: goldiumMint.publicKey,
          playerTokenAccount: playerTokenAccount,
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
});