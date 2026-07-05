const { createUmi, signerIdentity } = require('@metaplex-foundation/umi');
const { web3JsEddsa } = require('@metaplex-foundation/umi-eddsa-web3js');
const { web3JsRpc } = require('@metaplex-foundation/umi-rpc-web3js');
const { mplTokenMetadata, createMetadataAccountV3 } = require('@metaplex-foundation/mpl-token-metadata');
const { fromWeb3JsPublicKey, toWeb3JsPublicKey } = require('@metaplex-foundation/umi-web3js-adapters');
const { PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

const walletPath = '/home/jack/.config/solana/id.json';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath))));

const umi = createUmi('https://rpc.testnet.x1.xyz')
  .use(web3JsEddsa())
  .use(web3JsRpc())
  .use(mplTokenMetadata());

const umiSigner = {
  publicKey: fromWeb3JsPublicKey(wallet.publicKey),
  secretKey: () => wallet.secretKey,
  signMessage: async (message) => {
    const nacl = require('tweetnacl');
    return nacl.sign.detached(message, wallet.secretKey);
  },
  signTransaction: async (tx) => tx,
  signAllTransactions: async (txs) => txs,
};
umi.use(signerIdentity(umiSigner));

const goldMint = fromWeb3JsPublicKey(new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX'));
const configPda = fromWeb3JsPublicKey(new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG'));

async function main() {
  const builder = createMetadataAccountV3(umi, {
    mint: goldMint,
    mintAuthority: configPda,
    payer: umiSigner.publicKey,
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
    console.log('  Program:', ix.programId);
    console.log('  Data length:', ix.data.length);
    console.log('  Data hex:', Buffer.from(ix.data).toString('hex'));
    console.log('  Keys:');
    ix.keys.forEach((k, j) => {
      console.log(`    [${j}] ${k.pubkey} signer=${k.isSigner} writable=${k.isWritable}`);
    });
  });
}

main().catch(console.error);
