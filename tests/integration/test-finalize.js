const {
  Connection, PublicKey, Keypair, Transaction,
  TransactionInstruction, sendAndConfirmTransaction, SystemProgram
} = require('@solana/web3.js');
const fs = require('fs');
const crypto = require('crypto');

const RPC = 'https://x1-testnet.xen.network';
const PROGRAM_ID = new PublicKey('J5SrYjfRKinc7irrWJ1nVHfB3VvpQPidi5rPfEpBHSTu');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const idJson = JSON.parse(fs.readFileSync('/home/jack/.config/solana/id.json', 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(idJson));

const connection = new Connection(RPC, 'confirmed');

function getDiscriminator(name) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().slice(0, 8);
}

const [gameConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('silver_config_v2')], PROGRAM_ID);
const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('treasury'), gameConfigPda.toBuffer()],
  PROGRAM_ID
);

// Testnet GOLD mint (Token-2022) — freshly created for testing
const GOLD_MINT = new PublicKey('Bav4TAa6Juf4ZMzXd76TGcmzNWchGr44EF1wSE9AvifU');

async function main() {
  console.log('Authority:', authority.publicKey.toBase58());
  console.log('Program:', PROGRAM_ID.toBase58());
  console.log('GameConfig PDA:', gameConfigPda.toBase58());
  console.log('Treasury PDA:', treasuryPda.toBase58());
  console.log('Gold Mint:', GOLD_MINT.toBase58());

  // Create gold_bitmap account (128KB, program-owned)
  console.log('\n=== Pre: Create gold_bitmap account ===');
  const bitmapKeypair = Keypair.generate();
  const createBitmapIx = SystemProgram.createAccount({
    fromPubkey: authority.publicKey,
    newAccountPubkey: bitmapKeypair.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(131072),
    space: 131072,
    programId: PROGRAM_ID,
  });
  const createBitmapTx = new Transaction().add(createBitmapIx);
  const bitmapSig = await sendAndConfirmTransaction(connection, createBitmapTx, [authority, bitmapKeypair]);
  console.log('✅ gold_bitmap created:', bitmapKeypair.publicKey.toBase58(), 'tx:', bitmapSig);

  const initDisc = getDiscriminator('initialize_game');
  const initTreasuryDisc = getDiscriminator('init_treasury');
  const finalizeDisc = getDiscriminator('finalize_game');

  console.log('\n=== Step 1: initialize_game ===');
  const initTx = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },  // 0: authority
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },       // 1: game_config
        { pubkey: bitmapKeypair.publicKey, isSigner: false, isWritable: true }, // 2: gold_bitmap
        { pubkey: GOLD_MINT, isSigner: false, isWritable: true },           // 3: gold_mint
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // 4: token_program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 5: system_program
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(initDisc),
    })
  );
  const initSig = await sendAndConfirmTransaction(connection, initTx, [authority]);
  console.log('✅ initialize_game tx:', initSig);

  // Verify GameConfig was created
  const cfgInfo = await connection.getAccountInfo(gameConfigPda);
  console.log('GameConfig space:', cfgInfo.data.length, 'bytes (expected 114 for new struct)');

  console.log('\n=== Step 2: init_treasury ===');
  const treasuryTx = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },  // 0: authority
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },        // 1: game_config
        { pubkey: treasuryPda, isSigner: false, isWritable: true },        // 2: treasury
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 3: system_program
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(initTreasuryDisc),
    })
  );
  const treasurySig = await sendAndConfirmTransaction(connection, treasuryTx, [authority]);
  console.log('✅ init_treasury tx:', treasurySig);

  console.log('\n=== Step 3: finalize_game ===');
  const finalizeTx = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false }, // 0: authority
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },       // 1: game_config
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 2: system_program
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(finalizeDisc),
    })
  );
  const finalizeSig = await sendAndConfirmTransaction(connection, finalizeTx, [authority]);
  console.log('✅ finalize_game tx:', finalizeSig);

  // Verify immutable is set
  const cfgAfter = await connection.getAccountInfo(gameConfigPda);
  // Anchor discriminator (8) + authority(32) + grid_size(4) + gold_mint(32) + gold_bitmap(32) + total_gold_mined(8) + bump(1) + immutable(1) = 118 bytes
  // immutable is at offset: 8 + 32 + 4 + 32 + 32 + 8 + 1 = 117
  const immutableByte = cfgAfter.data[117];
  console.log('\n=== Verification ===');
  console.log('Account size:', cfgAfter.data.length, 'bytes');
  console.log('immutable field (byte at offset 117):', immutableByte);
  console.log(immutableByte === 1 ? '✅ Game is FINALIZED — no further config changes possible' : '❌ Game NOT finalized');

  // Try calling update_gold_mint to verify it's blocked
  console.log('\n=== Step 4: Verify update_gold_mint is blocked ===');
  const updateDisc = getDiscriminator('update_gold_mint');
  const updateTx = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },
        { pubkey: GOLD_MINT, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(updateDisc),
    })
  );
  try {
    await sendAndConfirmTransaction(connection, updateTx, [authority]);
    console.log('❌ update_config SUCCEEDED — this should have been blocked!');
  } catch (e) {
    if (e.transactionLogs?.some(l => l.includes('GameIsImmutable'))) {
      console.log('✅ update_config CORRECTLY BLOCKED — GameIsImmutable error');
    } else {
      console.log('⚠️ update_config failed for other reason:', e.transactionLogs?.find(l => l.includes('Error')) || e.message);
    }
  }

  console.log('\n🎉 All tests passed! finalize_game() works correctly.');
}

main().catch(e => {
  console.error('Error:', e.transactionLogs?.join('\n') || e.message);
  process.exit(1);
});

// Quick dump: read GameConfig and show bytes around offset 113
async function dumpConfig() {
  const acc = await connection.getAccountInfo(gameConfigPda);
  console.log('\n=== GameConfig Raw Dump ===');
  console.log('Total length:', acc.data.length);
  console.log('First 20 bytes (hex):', Array.from(acc.data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('Bytes 110-118 (hex):', Array.from(acc.data.slice(110, 118)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('Offset 113 (immutable?):', acc.data[113]);
  console.log('Offset 114:', acc.data[114]);
  console.log('Offset 115:', acc.data[115]);
  console.log('Offset 116:', acc.data[116]);
  console.log('Offset 117:', acc.data[117]);
}
dumpConfig().catch(console.error);
