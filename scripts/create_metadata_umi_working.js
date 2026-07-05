const { createUmi, signerIdentity } = require('@metaplex-foundation/umi');
const { createSignerFromKeypair } = require('@metaplex-foundation/umi');
const { defaultPlugins } = require('@metaplex-foundation/umi-bundle-defaults');
const { mplTokenMetadata, createMetadataAccountV3 } = require('@metaplex-foundation/mpl-token-metadata');
const { fromWeb3JsPublicKey, toWeb3JsPublicKey } = require('@metaplex-foundation/umi-web3js-adapters');
const { PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

const walletPath = '/home/jack/.config/solana/id.json';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath))));

// Create Umi instance with defaults
const umi = createUmi('https://rpc.testnet.x1.xyz');
umi.use(defaultPlugins());
umi.use(mplTokenMetadata());

// Create signer from keypair
const kp = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(wallet.secretKey));
const signer = createSignerFromKeypair(umi, kp);
umi.use(signerIdentity(signer));

const goldMint = fromWeb3JsPublicKey(new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX'));
const configPda = fromWeb3JsPublicKey(new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG'));

async function main() {
  console.log('Umi signer:', signer.publicKey.toString());
  console.log('Gold mint:', goldMint.toString());
  console.log('Config PDA:', configPda.toString());

  const builder = createMetadataAccountV3(umi, {
    mint: goldMint,
    mintAuthority: configPda,
    payer: signer.publicKey,
    updateAuthority: configPda,
    data: {
      name: 'Goldium',
      symbol: 'GOLD',
      uri: 'https://gold-miner.vercel.app/token-metadata.json',
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    },
    isMutable: true,
    collectionDetails: null,
  });

  const ixs = builder.getInstructions();
  console.log('Instructions:', ixs.length);
  
  ixs.forEach((ix, i) => {
    console.log(`\nInstruction ${i}:`);
    console.log('  Program:', ix.programId.toString());
    console.log('  Data length:', ix.data.length);
    console.log('  Data hex:', Buffer.from(ix.data).toString('hex'));
    console.log('  Keys:');
    ix.keys.forEach((k, j) => {
      console.log(`    [${j}] ${k.pubkey.toString()} signer=${k.isSigner} writable=${k.isWritable}`);
    });
  });
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
