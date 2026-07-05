const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/home/jack/.config/solana/id.json'))));
const PROGRAM_ID = new PublicKey('4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM');
const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Derive PDAs
function getConfigPda() {
  return PublicKey.findProgramAddressSync([Buffer.from('game_config')], PROGRAM_ID)[0];
}
function getVaultAta() {
  return PublicKey.findProgramAddressSync(
    [wallet.publicKey.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), goldMint.toBuffer()],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  )[0];
}

const configPda = getConfigPda();
const [metadataPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), METAPLEX.toBuffer(), goldMint.toBuffer()], METAPLEX
);

console.log('Wallet:', wallet.publicKey.toBase58());
console.log('Config PDA:', configPda.toBase58());
console.log('Metadata PDA:', metadataPda.toBase58());

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed');

  // Check if metadata exists
  const meta = await conn.getAccountInfo(metadataPda);
  if (meta) {
    console.log('✅ Metadata already exists!');
    console.log('  Owner:', meta.owner.toBase58());
    console.log('  Size:', meta.data.length, 'bytes');
    return;
  }

  console.log('Calling create_metadata via program CPI...');

  // Discriminator for create_metadata (8 bytes)
  // We computed this as [33, 53, 200, 251, 150, 163, 229, 64]
  const DISCRIMINATOR = Buffer.from([33, 53, 200, 251, 150, 163, 229, 64]);

  // No additional data needed for create_metadata (just discriminator)
  const ixData = DISCRIMINATOR;

  // Accounts for create_metadata instruction in lib.rs:
  // 0. authority (signer)
  // 1. gold_mint (writable)
  // 2. metadata_account (writable)
  // 3. mint_authority (writable) = game_config PDA
  // 4. payer (signer, writable)
  // 5. system_program
  // 6. token_program = Token-2022
  // 7. metadata_program = Metaplex
  // 8. rent = SysvarRent111111111111111111111111111111111

  const tx = new Transaction();
  tx.add({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false }, // authority
      { pubkey: goldMint, isSigner: false, isWritable: true },           // gold_mint
      { pubkey: metadataPda, isSigner: false, isWritable: true },        // metadata_account
      { pubkey: configPda, isSigner: false, isWritable: true },          // mint_authority (config PDA)
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },    // payer
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: METAPLEX, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: ixData,
  });

  tx.feePayer = wallet.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  console.log('Sending transaction...');
  const sig = await conn.sendTransaction(tx, [wallet], { commitment: 'confirmed' });
  console.log('TX sent:', sig);

  await conn.confirmTransaction(sig, 'confirmed');
  console.log('✅ Confirmed!');

  // Verify
  const metaAfter = await conn.getAccountInfo(metadataPda);
  if (metaAfter) {
    console.log('✅ Metadata account exists');
    console.log('  Owner:', metaAfter.owner.toBase58());
    console.log('  Size:', metaAfter.data.length, 'bytes');
  } else {
    console.log('❌ Metadata account not found');
  }
}

main().catch(e => { console.error('Error:', e.message); if (e.logs) console.error('Logs:', e.logs); process.exit(1); });
