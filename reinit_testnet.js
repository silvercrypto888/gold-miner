const {
  Connection, PublicKey, Keypair, Transaction, SystemProgram,
  TransactionInstruction, sendAndConfirmTransaction
} = require('@solana/web3.js');
const fs = require('fs');

const RPC = 'https://x1-testnet.xen.network';
const PROGRAM_ID = new PublicKey('4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM');

// Load deployer wallet
const idJson = JSON.parse(fs.readFileSync('/home/jack/.config/solana/id.json', 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(idJson));

const connection = new Connection(RPC, 'confirmed');

// PDA derivation
const [gameConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('silver_config_v2_v2')], PROGRAM_ID);
const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('treasury'), gameConfigPda.toBuffer()],
  PROGRAM_ID
);

// Discriminators (Anchor computes from "global:<instruction_name>")
// These are SHA256("global:initialize_game")[:8] etc.
// Using Anchor TS would be easier but let's compute or use known values

async function main() {
  console.log('Authority:', authority.publicKey.toBase58());
  console.log('GameConfig PDA:', gameConfigPda.toBase58());
  console.log('Treasury PDA:', treasuryPda.toBase58());

  // Check if GameConfig exists
  const accInfo = await connection.getAccountInfo(gameConfigPda);
  if (accInfo) {
    console.log('GameConfig exists. Space:', accInfo.data.length, 'Owner:', accInfo.owner.toBase58());
    if (accInfo.owner.toBase58() === PROGRAM_ID.toBase58()) {
      console.log('Closing old GameConfig account...');
      // Close instruction: we need to CPI into the program to close it
      // But the program doesn't have a close instruction...
      // We can just re-initialize by passing the existing account with init_if_needed
      // Actually no, Anchor init requires the account NOT exist
      // We need to close it by transferring lamports out
      // But only the program can modify its PDAs...
      console.log('Cannot close program-owned PDA without program instruction. Will try init anyway...');
    }
  } else {
    console.log('GameConfig does NOT exist. Ready to initialize.');
  }

  // We need the actual discriminators. Let's fetch them from the deployed program
  // Or compute them manually. The Anchor discriminator is:
  // sha256("global:initialize_game")[0..8]
  
  // Let's use a simpler approach: create a raw transaction with the right accounts
  // But we need the instruction data (discriminator + args)
  
  // For initialize_game, there are NO args after the discriminator
  // Accounts: authority (signer, payer), game_config (init, PDA), system_program
  
  // Compute discriminator manually
  const crypto = require('crypto');
  function getDiscriminator(name) {
    return crypto.createHash('sha256').update(`global:${name}`).digest().slice(0, 8);
  }
  
  const initDisc = getDiscriminator('initialize_game');
  const initTreasuryDisc = getDiscriminator('init_treasury');
  
  console.log('Init discriminator:', Array.from(initDisc).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('InitTreasury discriminator:', Array.from(initTreasuryDisc).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // For init_treasury, accounts are:
  // authority (signer), treasury (init, PDA), game_config (mut), gold_mint, system_program
  // We need the gold_mint public key
  
  // From the frontend constants, the gold_mint is stored in env or fetched from config
  // Let's read it from the existing config or use a placeholder
  // Actually let's fetch the current game_config data if it exists to get the gold_mint
  
  let goldMint;
  if (accInfo) {
    // Decode: first 8 bytes = discriminator, then GameConfig fields
    // After Anchor account discriminator (8 bytes), the data starts
    // Actually for an initialized account, the first 8 bytes are the account discriminator
    // Then: authority (32), gold_mint (32), gold_bitmap (32), total_gold_mined (8), bump (1)
    // = 8 + 32 + 32 + 32 + 8 + 1 = 113 bytes (old) or 114 (new)
    const data = accInfo.data;
    goldMint = new PublicKey(data.slice(8 + 32, 8 + 32 + 32));
    console.log('Current gold_mint from config:', goldMint.toBase58());
  } else {
    // Use default from frontend or a known testnet mint
    goldMint = new PublicKey('EarL8NaAje3mx5UGC86CWByVnotKgibkGmuJh6bHcWdz'); // from AMM_GOLD_MINT
    console.log('Using default gold_mint:', goldMint.toBase58());
  }

  // Step 1: initialize_game (if account doesn't exist, this creates it)
  // If account exists and is owned by program, we need to handle this differently
  
  if (!accInfo) {
    console.log('\n=== Step 1: initialize_game ===');
    const initTx = new Transaction().add(
      new TransactionInstruction({
        keys: [
          { pubkey: authority.publicKey, isSigner: true, isWritable: true },
          { pubkey: gameConfigPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: Buffer.from(initDisc),
      })
    );
    const initSig = await sendAndConfirmTransaction(connection, initTx, [authority]);
    console.log('initialize_game tx:', initSig);
  } else {
    console.log('GameConfig already exists, skipping initialize_game');
  }

  // Step 2: init_treasury
  console.log('\n=== Step 2: init_treasury ===');
  const initTreasuryTx = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: treasuryPda, isSigner: false, isWritable: true },
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },
        { pubkey: goldMint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(initTreasuryDisc),
    })
  );
  const treasurySig = await sendAndConfirmTransaction(connection, initTreasuryTx, [authority]);
  console.log('init_treasury tx:', treasurySig);

  console.log('\n✅ Done! GameConfig and Treasury re-initialized.');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
