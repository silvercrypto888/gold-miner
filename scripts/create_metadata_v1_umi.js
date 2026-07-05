const { createUmi, signerIdentity } = require('@metaplex-foundation/umi');
const { defaultPlugins } = require('@metaplex-foundation/umi-bundle-defaults');
const { mplTokenMetadata, createV1 } = require('@metaplex-foundation/mpl-token-metadata');
const { fromWeb3JsPublicKey } = require('@metaplex-foundation/umi-web3js-adapters');
const { PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

const walletPath = '/home/jack/.config/solana/id.json';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath))));

const conn = new (require('@solana/web3.js').Connection)('https://rpc.testnet.x1.xyz', 'confirmed');
const umi = createUmi(conn).use(defaultPlugins(conn));
umi.use(mplTokenMetadata());

const kp = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(wallet.secretKey));
umi.use(signerIdentity(kp));

const goldMint = fromWeb3JsPublicKey(new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX'));
const configPda = fromWeb3JsPublicKey(new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG'));

async function main() {
  console.log('Creating metadata via createV1 (unified Metaplex instruction)...');
  console.log('Wallet:', wallet.publicKey.toBase58());
  console.log('Config PDA:', configPda.toString());
  console.log('Gold mint:', goldMint.toString());

  // Check metadata exists
  const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METAPLEX.toBuffer(), new PublicKey(goldMint.toString()).toBuffer()], METAPLEX
  );
  
  const meta = await conn.getAccountInfo(metadataPda);
  if (meta) {
    console.log('✅ Metadata already exists!');
    return;
  }

  // Build createV1 instruction
  const builder = createV1(umi, {
    mint: goldMint,
    authority: configPda,       // mint authority (config PDA) - must be signer via our program
    payer: umi.identity.publicKey,
    updateAuthority: configPda,
    name: 'Goldium',
    symbol: 'GOLD',
    uri: 'https://gold-miner.vercel.app/token-metadata.json',
    sellerFeeBasisPoints: 0,
    creators: null,
    primarySaleHappened: false,
    isMutable: true,
    tokenStandard: 2,           // 2 = Fungible
    collection: null,
    uses: null,
    collectionDetails: null,
    ruleSet: null,
    decimals: null,
    printSupply: null,
  });

  console.log('Building transaction...');
  
  // Build and send via Umi
  const tx = await builder.buildAndSign(umi);
  console.log('Transaction built, signatures:', tx.signatures.length);
  
  // Send
  console.log('Sending...');
  const sig = await umi.rpc.sendTransaction(tx);
  console.log('TX:', sig);
  
  console.log('Confirming...');
  await umi.rpc.confirmTransaction(sig, { commitment: 'confirmed' });
  console.log('✅ Confirmed!');
}

main().catch(e => { 
  console.error('Error:', e); 
  process.exit(1); 
});
