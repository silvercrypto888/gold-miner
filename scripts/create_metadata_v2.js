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

// For V2: discriminator is [16] (not 33 for V3)
// DataV2 has:
//   name: string
//   symbol: string
//   uri: string
//   seller_fee_basis_points: u16
//   creators: Option<Vec<Creator>>
// But V2 instruction struct doesn't include isMutable/collectionDetails

function serializeString(s) {
  const buf = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

// Try V2 format: [16] + DataV2
const name = 'Goldium';
const symbol = 'GOLD';
const uri = 'https://gold-miner.vercel.app/token-metadata.json';

const dataV2 = Buffer.concat([
  Buffer.from([16]), // V2 discriminator
  serializeString(name),
  serializeString(symbol),
  serializeString(uri),
  Buffer.from([0, 0]), // seller_fee_basis_points = 0 (u16 LE)
  Buffer.from([0]),    // creators: None
]);

console.log('V2 data length:', dataV2.length);
console.log('V2 data hex:', dataV2.toString('hex'));

// Try V3 format again with update_authority as signer
const dataV3 = Buffer.from('2107000000476f6c6469756d04000000474f4c443100000068747470733a2f2f676f6c642d6d696e65722e76657263656c2e6170702f746f6b656e2d6d657461646174612e6a736f6e00000000000100', 'hex');

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

  console.log('Gold mint owner:', (await conn.getAccountInfo(goldMint)).owner.toBase58());

  // Try V3 first with update_authority as signer
  console.log('\\nTrying V3 with update_authority as signer...');
  try {
    const tx = new Transaction();
    tx.add({
      keys: [
        { pubkey: metadataPda, isSigner: false, isWritable: true },
        { pubkey: goldMint, isSigner: false, isWritable: false },
        { pubkey: configPda, isSigner: true, isWritable: false }, // mint_authority as signer
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // payer
        { pubkey: configPda, isSigner: true, isWritable: false }, // update_authority as signer
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
        { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
      ],
      programId: METAPLEX,
      data: dataV3,
    });

    tx.feePayer = wallet.publicKey;
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const sig = await conn.sendTransaction(tx, [wallet], { commitment: 'confirmed' });
    console.log('V3 TX:', sig);
    await conn.confirmTransaction(sig, 'confirmed');
    console.log('✅ V3 succeeded!');
    return;
  } catch (e) {
    console.log('V3 failed:', e.message);
    if (e.logs) console.log('Logs:', e.logs[e.logs.length - 3]);
  }

  // Try V2
  console.log('\\nTrying V2...');
  try {
    const tx = new Transaction();
    tx.add({
      keys: [
        { pubkey: metadataPda, isSigner: false, isWritable: true },
        { pubkey: goldMint, isSigner: false, isWritable: false },
        { pubkey: configPda, isSigner: true, isWritable: false },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: configPda, isSigner: true, isWritable: false },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
        { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
      ],
      programId: METAPLEX,
      data: dataV2,
    });

    tx.feePayer = wallet.publicKey;
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const sig = await conn.sendTransaction(tx, [wallet], { commitment: 'confirmed' });
    console.log('V2 TX:', sig);
    await conn.confirmTransaction(sig, 'confirmed');
    console.log('✅ V2 succeeded!');
  } catch (e) {
    console.log('V2 failed:', e.message);
    if (e.logs) console.log('Logs:', e.logs[e.logs.length - 3]);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
