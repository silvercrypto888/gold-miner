const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const PROGRAM_ID = new PublicKey('4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM');
const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const TOKEN22 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

const walletPath = '/home/jack/.config/solana/id.json';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath))));

// PDAs
const configPda = PublicKey.findProgramAddressSync([Buffer.from('silver_config_v2')], PROGRAM_ID)[0];
const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const [metadataPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), METAPLEX.toBuffer(), goldMint.toBuffer()], METAPLEX
);

// Discriminator for "create_metadata" (sha256 hash prefix)
const DISCRIM = Buffer.from([0x1e, 0x23, 0x75, 0x86, 0xc4, 0x8b, 0x2c, 0x19]);

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

  console.log('Wallet:', wallet.publicKey.toBase58());
  console.log('Config PDA:', configPda.toBase58());
  console.log('Gold mint:', goldMint.toBase58());
  console.log('Metadata PDA:', metadataPda.toBase58());

  // Serialize "create_metadata" instruction
  const uri = 'https://gold-miner.vercel.app/token-metadata.json';
  const uriBuf = Buffer.from(uri, 'utf8');
  const data = Buffer.concat([
    DISCRIM,
    Buffer.alloc(4),         // string discriminant (0 for string)
    Buffer.from(uriBuf.length.toString(16).padStart(8, '0'), 'hex').reverse(), // u32 LE length
    uriBuf,
  ]);

  console.log('Data length:', data.length);
  console.log('Data hex:', data.toString('hex'));

  // Build transaction - account order must match Rust struct:
  // 0. authority (Signer)
  // 1. game_config (seeds=["silver_config_v2"])
  // 2. gold_mint (mut)
  // 3. metadata_account (mut)
  // 4. metaplex_program
  // 5. system_program
  // 6. sysvar_instructions
  // 7. token_program (Token2022)
  const tx = new Transaction();
  tx.add({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },     // 0: authority
      { pubkey: configPda, isSigner: false, isWritable: true },            // 1: game_config
      { pubkey: goldMint, isSigner: false, isWritable: true },             // 2: gold_mint (mut)
      { pubkey: metadataPda, isSigner: false, isWritable: true },          // 3: metadata_account
      { pubkey: METAPLEX, isSigner: false, isWritable: false },            // 4: metaplex_program
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },   // 5: system_program
      { pubkey: new PublicKey('Sysvar1nstructions1111111111111111111111111'), isSigner: false, isWritable: false }, // 6: sysvar_instructions
      { pubkey: TOKEN22, isSigner: false, isWritable: false },              // 7: token_program
    ],
    programId: PROGRAM_ID,
    data: data,
  });

  tx.feePayer = wallet.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  console.log('Sending...');
  const sig = await conn.sendTransaction(tx, [wallet], { commitment: 'confirmed' });
  console.log('TX:', sig);

  await conn.confirmTransaction(sig, 'confirmed');
  console.log('✅ Confirmed!');

  // Verify
  const metaAfter = await conn.getAccountInfo(metadataPda);
  if (metaAfter) {
    console.log('✅ Metadata created!');
    console.log('  Owner:', metaAfter.owner.toBase58());
    console.log('  Size:', metaAfter.data.length, 'bytes');
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  if (e.logs) console.error('Logs:', e.logs);
  process.exit(1);
});
