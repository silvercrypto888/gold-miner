const { Metaplex, keypairIdentity, token } = require('@metaplex-foundation/js');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const walletPath = '/home/jack/.config/solana/id.json';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath))));

const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const configPda = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');

async function main() {
  const conn = new Connection(RPC_URL, 'confirmed');
  const metaplex = Metaplex.make(conn).use(keypairIdentity(wallet));

  // Check current metadata
  const nft = await metaplex.nfts().findByMint({ mintAddress: goldMint }).catch(e => {
    console.log('No metadata found:', e.message);
    return null;
  });
  
  if (nft && nft.name) {
    console.log('✅ Metadata already exists!');
    console.log('  Name:', nft.name);
    console.log('  Symbol:', nft.symbol);
    return;
  }

  console.log('Creating metadata for existing mint...');
  console.log('Mint:', goldMint.toBase58());
  console.log('Mint authority (config PDA):', configPda.toBase58());
  console.log('Wallet:', wallet.publicKey.toBase58());

  // For existing mint, we need the mint authority to sign.
  // Since config PDA can't sign directly, we need to use the program.
  // But let's see what the SDK expects:
  try {
    const { response } = await metaplex.nfts().createSft({
      uri: 'https://gold-miner.vercel.app/token-metadata.json',
      name: 'Goldium',
      symbol: 'GOLD',
      sellerFeeBasisPoints: 0,
      isMutable: true,
      useExistingMint: goldMint,
      tokenOwner: wallet.publicKey,
      tokenAddress: configPda, // This might be wrong, just testing
    });
    console.log('TX:', response.signature);
    console.log('✅ Metadata created!');
  } catch (e) {
    console.error('Error:', e.message);
    if (e.cause) console.error('Cause:', e.cause);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
