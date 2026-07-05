const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const crypto = require('crypto');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("/home/jack/.config/solana/id.json"))));
const PROGRAM_ID = new PublicKey('4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM');
const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const METAPLEX = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const configPda = PublicKey.findProgramAddressSync([Buffer.from('game_config')], PROGRAM_ID)[0];
const [metadataPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('metadata'), METAPLEX.toBuffer(), goldMint.toBuffer()], METAPLEX
);

// Possible discriminators to try
function anchorSighash(name) {
  const hash = crypto.createHash('sha256').update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

function anchorSighashNoPrefix(name) {
  const hash = crypto.createHash('sha256').update(name).digest();
  return hash.slice(0, 8);
}

const candidates = [
  { name: 'global:create_metadata', bytes: anchorSighash('create_metadata') },
  { name: 'create_metadata', bytes: anchorSighashNoPrefix('create_metadata') },
  { name: 'global:createMetadata', bytes: anchorSighash('createMetadata') },
  { name: 'createMetadata', bytes: anchorSighashNoPrefix('createMetadata') },
  { name: 'global:CreateMetadata', bytes: anchorSighash('CreateMetadata') },
  { name: 'CreateMetadata', bytes: anchorSighashNoPrefix('CreateMetadata') },
  { name: 'global:create_metadat', bytes: anchorSighash('create_metadat') }, // truncated?
  { name: 'old wrong disc', bytes: Buffer.from([33, 53, 112, 152, 15, 18, 109, 168]) },
  { name: 'correct disc', bytes: Buffer.from([33, 53, 200, 251, 150, 163, 229, 64]) },
  { name: 'create_metadata_account_v3', bytes: anchorSighashNoPrefix('create_metadata_account_v3') },
];

console.log('Wallet:', wallet.publicKey.toBase58());
console.log('Testing', candidates.length, 'discriminator candidates...');

async function testDiscriminator(disc) {
  const conn = new Connection(RPC_URL, 'confirmed');
  const tx = new Transaction();
  tx.add({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: goldMint, isSigner: false, isWritable: true },
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: METAPLEX, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: disc,
  });
  tx.feePayer = wallet.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  try {
    await conn.simulateTransaction(tx, [wallet]);
    return { result: 'SUCCESS' };
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('FallbackNotFound')) return { result: 'FallbackNotFound' };
    if (msg.includes('mint authority')) return { result: 'MINT_AUTHORITY_CHECK' };
    if (msg.includes('account')) return { result: 'ACCOUNT_ERROR' };
    return { result: 'OTHER', msg: msg.slice(0, 100) };
  }
}

async function main() {
  for (const c of candidates) {
    const result = await testDiscriminator(c.bytes);
    console.log(`${c.name}: ${result.result}` + (result.msg ? ` - ${result.msg}` : ''));
    if (result.result !== 'FallbackNotFound') {
      console.log('  ^ FOUND matching discriminator!');
      break;
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(console.error);
