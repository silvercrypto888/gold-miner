const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const walletPath = '/home/jack/.config/solana/id.json';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath))));
const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const configPda = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');

const [metadataPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), METAPLEX.toBuffer(), goldMint.toBuffer()], METAPLEX
);

console.log('Wallet:', wallet.publicKey.toBase58());
console.log('Config PDA:', configPda.toBase58());
console.log('Gold mint:', goldMint.toBase58());
console.log('Metadata PDA:', metadataPda.toBase58());

// Exact data from Umi serializer output
const DATA_HEX = '2107000000476f6c6469756d04000000474f4c443100000068747470733a2f2f676f6c642d6d696e65722e76657263656c2e6170702f746f6b656e2d6d657461646174612e6a736f6e00000000000100';
const data = Buffer.from(DATA_HEX, 'hex');

console.log('Data length:', data.length);
console.log('Data matches expected (80)?', data.length === 80);

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

  console.log('Creating metadata via direct transaction...');

  const tx = new Transaction();
  tx.add({
    keys: [
      { pubkey: metadataPda, isSigner: false, isWritable: true },     // metadata
      { pubkey: goldMint, isSigner: false, isWritable: false },       // mint
      { pubkey: configPda, isSigner: false, isWritable: false },     // mint_authority (config PDA is the mint authority)
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // payer
      { pubkey: configPda, isSigner: false, isWritable: false },       // update_authority
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system_program
      { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false }, // rent
    ],
    programId: METAPLEX,
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

main().catch(e => { console.error('Error:', e.message); if (e.logs) console.error('Logs:', e.logs); process.exit(1); });
