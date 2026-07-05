const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { createUmi, signerIdentity } = require('@metaplex-foundation/umi');
const { createV1, TokenStandard } = require('@metaplex-foundation/mpl-token-metadata');
const { fromWeb3JsKeypair, fromWeb3JsPublicKey } = require('@metaplex-foundation/umi-web3js-adapters');
const { web3JsEddsa } = require('@metaplex-foundation/umi-eddsa-web3js');
const { rpc, sendAndConfirmTransactionFactory } = require('@metaplex-foundation/umi');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/home/jack/.config/solana/id.json'))));
const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const configPda = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed');
  const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METAPLEX.toBuffer(), goldMint.toBuffer()], METAPLEX
  );

  console.log('Wallet:', wallet.publicKey.toBase58());
  console.log('Config PDA:', configPda.toBase58());
  console.log('Metadata PDA:', metadataPda.toBase58());

  const meta = await conn.getAccountInfo(metadataPda);
  if (meta) {
    console.log('✅ Metadata already exists!');
    return;
  }

  console.log('Creating metadata via createV1 with raw web3...');

  // Build instruction data manually following the createV1 spec
  // Discriminator: u8 = 42, createV1Discriminator: u8 = 0
  // Then: name, symbol, uri (all u32-prefixed strings)
  // u16 sellerFeeBasisPoints (0)
  // Option creators (None = 0)
  // bool primarySaleHappened (false = 0)
  // bool isMutable (true = 1)
  // TokenStandard enum: u8 = 2 (Fungible)
  // Option collection (None = 0)
  // Option uses (None = 0)
  // Option collectionDetails (None = 0)
  // Option ruleSet (None = 0)
  // Option decimals (Some(9) = 1, 9)
  // Option printSupply (None = 0)

  const name = Buffer.from('Goldium', 'utf8');
  const symbol = Buffer.from('GOLD', 'utf8');
  const uri = Buffer.from('https://gold-miner.vercel.app/token-metadata.json', 'utf8');

  const nameLen = Buffer.alloc(4); nameLen.writeUInt32LE(name.length, 0);
  const symLen = Buffer.alloc(4); symLen.writeUInt32LE(symbol.length, 0);
  const uriLen = Buffer.alloc(4); uriLen.writeUInt32LE(uri.length, 0);

  const ixData = Buffer.concat([
    Buffer.from([42, 0]), // discriminator=42, createV1Discriminator=0
    nameLen, name,
    symLen, symbol,
    uriLen, uri,
    Buffer.from([0, 0]), // sellerFeeBasisPoints=0 (u16 LE)
    Buffer.from([0]), // creators=None
    Buffer.from([0]), // primarySaleHappened=false
    Buffer.from([1]), // isMutable=true
    Buffer.from([2]), // tokenStandard=Fungible (2)
    Buffer.from([0]), // collection=None
    Buffer.from([0]), // uses=None
    Buffer.from([0]), // collectionDetails=None
    Buffer.from([0]), // ruleSet=None
    Buffer.from([1, 9]), // decimals=Some(9)
    Buffer.from([0]), // printSupply=None
  ]);

  // Accounts for createV1:
  // 0. metadata (pda, writable)
  // 1. masterEdition (if non-fungible - but Fungible doesn't need it, so we can skip or use a dummy)
  // Actually for Fungible, masterEdition may not be needed. Let me check if we need it.
  // Looking at the code: if resolveIsNonFungible returns false, masterEdition is not added
  // But the account list always includes it. For Fungible tokens, it might be optional.

  // Let's use the exact accounts from createV1 but set masterEdition to a dummy PDA
  const [masterEditionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METAPLEX.toBuffer(), goldMint.toBuffer(), Buffer.from('edition')],
    METAPLEX
  );

  console.log('Master Edition PDA:', masterEditionPda.toBase58());
  console.log('Data length:', ixData.length);
  console.log('Data hex:', ixData.toString('hex').slice(0, 100));

  const tx = new Transaction();
  tx.add({
    keys: [
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: masterEditionPda, isSigner: false, isWritable: true },
      { pubkey: goldMint, isSigner: false, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      { pubkey: new PublicKey('Sysvar1nstructions1111111111111111111111111'), isSigner: false, isWritable: false },
      { pubkey: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'), isSigner: false, isWritable: false },
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
