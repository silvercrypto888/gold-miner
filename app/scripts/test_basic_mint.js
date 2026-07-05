const {
  Connection, Keypair
} = require('@solana/web3.js');
const {
  createMint,
  TOKEN_2022_PROGRAM_ID,
} = require('@solana/spl-token');
const fs = require('fs');

const RPC = 'https://rpc.testnet.x1.xyz';
const PAYER_KEYPAIR = '/home/jack/.config/solana/id.json';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR, 'utf8'))));
  
  console.log('Payer:', payer.publicKey.toBase58());
  console.log('Balance:', await conn.getBalance(payer.publicKey));
  
  // Test creating a basic Token-2022 mint (no extensions)
  console.log('Creating basic Token-2022 mint...');
  const mint = await createMint(
    conn,
    payer,
    payer.publicKey, // mint authority
    null, // freeze authority
    9, // decimals
    Keypair.generate(), // new mint keypair
    'confirmed',
    TOKEN_2022_PROGRAM_ID
  );
  
  console.log('Basic Token-2022 mint created:', mint.toBase58());
  
  const acc = await conn.getAccountInfo(mint);
  console.log('Account owner:', acc.owner.toBase58());
  console.log('Account space:', acc.data.length);
  
  const { getMint } = require('@solana/spl-token');
  const mintInfo = await getMint(conn, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
  console.log('Mint authority:', mintInfo.mintAuthority?.toBase58());
  console.log('Decimals:', mintInfo.decimals);
}

main().catch(e => { console.error(e); process.exit(1); });
