const { Metaplex, keypairIdentity } = require('@metaplex-foundation/js');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const walletPath = '/home/jack/.config/solana/id.json';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath))));

const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed');
  const metaplex = Metaplex.make(conn).use(keypairIdentity(wallet));

  // Check if metadata exists
  const metadata = await metaplex.nfts().findByMint({ mintAddress: goldMint }).catch(() => null);
  if (metadata) {
    console.log('✅ Metadata already exists!');
    console.log('  Name:', metadata.name);
    console.log('  Symbol:', metadata.symbol);
    return;
  }

  console.log('Creating metadata via @metaplex-foundation/js...');

  // For Token-2022 mint, we use createSft
  const { response } = await metaplex.nfts().createSft({
    name: 'Goldium',
    symbol: 'GOLD',
    uri: 'https://gold-miner.vercel.app/token-metadata.json',
    sellerFeeBasisPoints: 0,
    isMutable: true,
    useNewMint: false,
    existingMint: goldMint,
    updateAuthority: wallet,
    mintAuthority: wallet,
  });

  console.log('TX:', response.signature);
  console.log('✅ Metadata created!');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
