const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { createMetadataAccountV3, PROGRAM_ID: MPL_PROGRAM_ID } = require('@metaplex-foundation/mpl-token-metadata');
const { createUmi, signerIdentity, publicKey } = require('@metaplex-foundation/umi');
const { fromWeb3JsKeypair, fromWeb3JsPublicKey } = require('@metaplex-foundation/umi-web3js-adapters');
const { defaultPlugins } = require('@metaplex-foundation/umi-bundle-defaults');
const { mplTokenMetadata } = require('@metaplex-foundation/mpl-token-metadata');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/home/jack/.config/solana/id.json'))));
const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const configPda = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');
const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const [metadataPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), METAPLEX.toBuffer(), goldMint.toBuffer()], METAPLEX
);

console.log('Wallet:', wallet.publicKey.toBase58());
console.log('Config PDA:', configPda.toBase58());
console.log('Metadata PDA:', metadataPda.toBase58());

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed');

  const meta = await conn.getAccountInfo(metadataPda);
  if (meta) {
    console.log('✅ Metadata already exists!');
    console.log('  Owner:', meta.owner.toBase58());
    console.log('  Size:', meta.data.length, 'bytes');
    return;
  }

  console.log('Creating metadata via Metaplex SDK...');

  // Create UMI with web3js adapter and default plugins
  const umi = createUmi().use(defaultPlugins({
    rpc: RPC_URL,
  })).use(mplTokenMetadata());
  const signer = fromWeb3JsKeypair(wallet);
  umi.use(signerIdentity(signer));

  const ix = createMetadataAccountV3(umi, {
    metadata: fromWeb3JsPublicKey(metadataPda),
    mint: fromWeb3JsPublicKey(goldMint),
    mintAuthority: signer.publicKey,
    payer: signer.publicKey,
    updateAuthority: fromWeb3JsPublicKey(configPda),
    data: {
      name: 'Goldium',
      symbol: 'GOLD',
      uri: 'https://gold-miner.vercel.app/token-metadata.json',
      sellerFeeBasisPoints: 0,
      creators: null, collection: null, uses: null,
    },
    isMutable: true,
    collectionDetails: null,
  }).getInstructions()[0];

  const tx = new Transaction();
  tx.add({
    keys: ix.keys.map(k => ({ pubkey: new PublicKey(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable })),
    programId: new PublicKey(ix.programId),
    data: Buffer.from(ix.data),
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
