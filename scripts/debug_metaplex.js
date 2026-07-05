const { createUmi, signerIdentity } = require('@metaplex-foundation/umi');
const { createMetadataAccountV3 } = require('@metaplex-foundation/mpl-token-metadata');
const { fromWeb3JsPublicKey } = require('@metaplex-foundation/umi-web3js-adapters');
const { web3JsEddsa } = require('@metaplex-foundation/umi-eddsa-web3js');
const { PublicKey } = require('@solana/web3.js');

const umi = createUmi().use(web3JsEddsa());
const dummySigner = {
  publicKey: fromWeb3JsPublicKey(new PublicKey('2zotLCHPhTazmMVaRg9y4bmRm8mbBHb5XuvbV4mcQRAS')),
  secretKey: () => new Uint8Array(64),
  signMessage: async () => new Uint8Array(64),
  signTransaction: async (tx) => tx,
  signAllTransactions: async (txs) => txs,
};
umi.use(signerIdentity(dummySigner));

const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const configPda = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');

const [metadataPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), METAPLEX.toBuffer(), goldMint.toBuffer()], METAPLEX
);

const builder = createMetadataAccountV3(umi, {
  metadata: fromWeb3JsPublicKey(metadataPda),
  mint: fromWeb3JsPublicKey(goldMint),
  mintAuthority: fromWeb3JsPublicKey(configPda),
  payer: dummySigner.publicKey,
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
});

const ix = builder.getInstructions()[0];
console.log('Program ID:', ix.programId);
console.log('Data hex:', Buffer.from(ix.data).toString('hex'));
console.log('Data length:', ix.data.length);
console.log('First byte:', ix.data[0]);
console.log('Keys count:', ix.keys.length);
ix.keys.forEach((k, i) => console.log(`  [${i}] ${k.pubkey} signer=${k.isSigner} writable=${k.isWritable}`));
