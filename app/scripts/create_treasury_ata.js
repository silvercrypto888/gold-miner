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
const PROGRAM_ID = new PublicKey('4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM');

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR, 'utf8'))));
  
  // Derive treasury PDA
  const [gameConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('silver_config_v2')], PROGRAM_ID);
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury'), gameConfigPda.toBuffer()],
    PROGRAM_ID
  );
  
  const ata = getAssociatedTokenAddressSync(GOLD_MINT, treasuryPda, true, TOKEN_2022_PROGRAM_ID);
  console.log('Payer:', payer.publicKey.toBase58());
  console.log('Treasury PDA:', treasuryPda.toBase58());
  console.log('Treasury GOLD ATA:', ata.toBase58());
  
  // Check if exists
  const acc = await conn.getAccountInfo(ata);
  if (acc) {
    console.log('Treasury ATA already exists, owner:', acc.owner.toBase58());
    return;
  }
  
  // Create ATA instruction
  const ix = createAssociatedTokenAccountInstruction(
    payer.publicKey, // payer
    ata,             // associated token account address
    treasuryPda,     // owner (PDA)
    GOLD_MINT,       // mint
    TOKEN_2022_PROGRAM_ID
  );
  
  const tx = new Transaction();
  tx.add(ix);
  tx.feePayer = payer.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(payer);
  
  console.log('Creating treasury ATA...');
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  console.log('Tx:', sig);
  await conn.confirmTransaction(sig, 'confirmed');
  console.log('Treasury ATA created!');
}

main().catch(e => { console.error(e); process.exit(1); });
