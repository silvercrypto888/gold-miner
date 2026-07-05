const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/home/jack/.config/solana/id.json'))));
const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const configPda = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');
const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const SYSVAR_RENT = new PublicKey('SysvarRent111111111111111111111111111111111');

const [metadataPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), METAPLEX.toBuffer(), goldMint.toBuffer()], METAPLEX
);

// Discriminator is a SINGLE u8 = 33 (NOT an 8-byte hash!)
const DISCRIMINATOR = Buffer.from([33]);

// Serialize DataV2: name, symbol, uri (all u32-prefixed strings), u16 sellerFee, option creators, option collection, option uses
function serializeDataV2() {
  const name = Buffer.from('Goldium', 'utf8');
  const symbol = Buffer.from('GOLD', 'utf8');
  const uri = Buffer.from('https://gold-miner.vercel.app/token-metadata.json', 'utf8');

  const nameLen = Buffer.alloc(4); nameLen.writeUInt32LE(name.length, 0);
  const symLen = Buffer.alloc(4); symLen.writeUInt32LE(symbol.length, 0);
  const uriLen = Buffer.alloc(4); uriLen.writeUInt32LE(uri.length, 0);
  const sfp = Buffer.alloc(2); sfp.writeUInt16LE(0, 0); // sellerFeeBasisPoints = 0

  const creators = Buffer.from([0]); // None
  const collection = Buffer.from([0]); // None
  const uses = Buffer.from([0]); // None

  return Buffer.concat([nameLen, name, symLen, symbol, uriLen, uri, sfp, creators, collection, uses]);
}

const dataArgs = serializeDataV2();
const isMutable = Buffer.from([1]); // true
const collectionDetails = Buffer.from([0]); // None

const ixData = Buffer.concat([DISCRIMINATOR, dataArgs, isMutable, collectionDetails]);

console.log('Wallet:', wallet.publicKey.toBase58());
console.log('Config PDA:', configPda.toBase58());
console.log('Metadata PDA:', metadataPda.toBase58());
console.log('Instruction data length:', ixData.length);
console.log('Discriminator:', DISCRIMINATOR.toString('hex'), '(single u8)');

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed');

  const meta = await conn.getAccountInfo(metadataPda);
  if (meta) {
    console.log('✅ Metadata already exists!');
    console.log('  Owner:', meta.owner.toBase58());
    console.log('  Size:', meta.data.length, 'bytes');
    return;
  }

  console.log('Creating metadata via raw instruction...');

  const tx = new Transaction();
  tx.add({
    keys: [
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: goldMint, isSigner: false, isWritable: false },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT, isSigner: false, isWritable: false },
    ],
    programId: METAPLEX,
    data: ixData,
  });

  tx.feePayer = wallet.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  const sig = await conn.sendTransaction(tx, [wallet], { commitment: 'confirmed' });
  console.log('TX sent:', sig);
  await conn.confirmTransaction(sig, 'confirmed');
  console.log('✅ Confirmed!');
}

main().catch(e => { console.error('Error:', e.message); if (e.logs) console.error('Logs:', e.logs); process.exit(1); });
