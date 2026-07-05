const {
  Connection, PublicKey, Keypair, Transaction
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} = require('@solana/spl-token');
const fs = require('fs');

const RPC = 'https://rpc.testnet.x1.xyz';
const PAYER_KEYPAIR = '/home/jack/.config/solana/id.json';

const GOLD_MINT = new PublicKey('vKxnbuf4HeR6espPnfnVwaByaWgp3NHSGWGmjyNyrS6');
const OWNER = new PublicKey('RqDMFxMKDN34yzB1TEL8dT55HBRL1B1peGyoeobyxfX'); // Silver's wallet

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR, 'utf8'))));
  
  const ata = getAssociatedTokenAddressSync(GOLD_MINT, OWNER, false, TOKEN_2022_PROGRAM_ID);
  console.log('Payer:', payer.publicKey.toBase58());
  console.log('Owner:', OWNER.toBase58());
  console.log('GOLD ATA:', ata.toBase58());
  
  // Check if exists
  const acc = await conn.getAccountInfo(ata);
  if (acc) {
    console.log('ATA already exists, owner:', acc.owner.toBase58());
    return;
  }
  
  // Create ATA instruction
  const ix = createAssociatedTokenAccountInstruction(
    payer.publicKey, // payer
    ata,             // associated token account address
    OWNER,           // owner
    GOLD_MINT,       // mint
    TOKEN_2022_PROGRAM_ID
  );
  
  const tx = new Transaction();
  tx.add(ix);
  tx.feePayer = payer.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(payer);
  
  console.log('Creating ATA...');
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  console.log('Tx:', sig);
  await conn.confirmTransaction(sig, 'confirmed');
  console.log('ATA created!');
  
  // Verify
  const accAfter = await conn.getAccountInfo(ata);
  console.log('Owner:', accAfter.owner.toBase58());
  console.log('Mint (first 32):', accAfter.data.slice(0, 32).toString('hex').slice(0, 20) + '...');
}

main().catch(e => { console.error(e); process.exit(1); });
