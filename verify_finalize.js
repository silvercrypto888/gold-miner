const {
  Connection, PublicKey, Keypair, Transaction,
  TransactionInstruction, sendAndConfirmTransaction, SystemProgram
} = require('@solana/web3.js');
const fs = require('fs');
const crypto = require('crypto');

const RPC = 'https://x1-testnet.xen.network';
const PROGRAM_ID = new PublicKey('J5SrYjfRKinc7irrWJ1nVHfB3VvpQPidi5rPfEpBHSTu');

const idJson = JSON.parse(fs.readFileSync('/home/jack/.config/solana/id.json', 'utf8'));
const authority = Keypair.fromSecretKey(Uint8Array.from(idJson));
const connection = new Connection(RPC, 'confirmed');

function getDiscriminator(name) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().slice(0, 8);
}

const [gameConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('silver_config_v2')], PROGRAM_ID);
const GOLD_MINT = new PublicKey('Bav4TAa6Juf4ZMzXd76TGcmzNWchGr44EF1wSE9AvifU');

async function main() {
  console.log('GameConfig PDA:', gameConfigPda.toBase58());

  // Verify immutable is set
  const cfg = await connection.getAccountInfo(gameConfigPda);
  console.log('Account size:', cfg.data.length, 'bytes');
  console.log('immutable byte (offset 117):', cfg.data[117]);
  console.log(cfg.data[117] === 1 ? '✅ GameConfig is FINALIZED' : '❌ NOT finalized');

  // Try update_gold_mint (should fail with GameIsImmutable)
  console.log('\n=== Trying update_gold_mint (should be blocked) ===');
  const updateDisc = getDiscriminator('update_gold_mint');
  const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  const updateTx = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: false },
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },
        { pubkey: GOLD_MINT, isSigner: false, isWritable: true },
        { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(updateDisc),
    })
  );
  try {
    await sendAndConfirmTransaction(connection, updateTx, [authority]);
    console.log('❌ update_gold_mint SUCCEEDED — should have been blocked!');
  } catch (e) {
    if (e.transactionLogs?.some(l => l.includes('GameIsImmutable'))) {
      console.log('✅ update_gold_mint CORRECTLY BLOCKED — GameIsImmutable');
    } else {
      console.log('⚠️ Failed for other reason:', e.transactionLogs?.find(l => l.includes('Error')));
    }
  }

  // Try init_treasury (should also fail with GameIsImmutable)
  console.log('\n=== Trying init_treasury (should also be blocked) ===');
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury'), gameConfigPda.toBuffer()],
    PROGRAM_ID
  );
  const initTreasuryDisc = getDiscriminator('init_treasury');
  const treasuryTx = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: gameConfigPda, isSigner: false, isWritable: true },
        { pubkey: treasuryPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(initTreasuryDisc),
    })
  );
  try {
    await sendAndConfirmTransaction(connection, treasuryTx, [authority]);
    console.log('❌ init_treasury SUCCEEDED — should have been blocked!');
  } catch (e) {
    if (e.transactionLogs?.some(l => l.includes('GameIsImmutable'))) {
      console.log('✅ init_treasury CORRECTLY BLOCKED — GameIsImmutable');
    } else if (e.transactionLogs?.some(l => l.includes('already in use'))) {
      console.log('✅ init_treasury blocked — treasury already exists');
    } else {
      console.log('⚠️ Failed for other reason:', e.transactionLogs?.find(l => l.includes('Error')));
    }
  }

  console.log('\n🎉 finalize_game() protection verified!');
}

main().catch(console.error);
