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

// Treasury PDA
const TREASURY = new PublicKey('8muQKfcRV2x2vS5MUFCCzN4V4aASBTZtEZVTUoTut58Y');
const LP_MINT = new PublicKey('R42M1rNtsrDvTAKMZbMWHE2TXZxPqAZzZ5bR6uR3Qzy');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const TOKENKEG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR, 'utf8'))));
  
  // Derive treasury LP ATA (SPL Token) — allowOwnerOffCurve=true for PDA owner
  const treasuryLpAta = getAssociatedTokenAddressSync(LP_MINT, TREASURY, true, TOKENKEG);
  console.log('Treasury LP ATA:', treasuryLpAta.toBase58());
  
  // Derive treasury WSOL ATA (SPL Token) — allowOwnerOffCurve=true for PDA owner
  const treasuryWsolAta = getAssociatedTokenAddressSync(WSOL_MINT, TREASURY, true, TOKENKEG);
  console.log('Treasury WSOL ATA:', treasuryWsolAta.toBase58());
  
  const tx = new Transaction();
  
  // Check if LP ATA exists
  const lpAcc = await conn.getAccountInfo(treasuryLpAta);
  if (!lpAcc) {
    console.log('Creating LP ATA...');
    tx.add(createAssociatedTokenAccountInstruction(
      payer.publicKey, treasuryLpAta, TREASURY, LP_MINT, TOKENKEG
    ));
  } else {
    console.log('LP ATA already exists');
  }
  
  // Check if WSOL ATA exists
  const wsolAcc = await conn.getAccountInfo(treasuryWsolAta);
  if (!wsolAcc) {
    console.log('Creating WSOL ATA...');
    tx.add(createAssociatedTokenAccountInstruction(
      payer.publicKey, treasuryWsolAta, TREASURY, WSOL_MINT, TOKENKEG
    ));
  } else {
    console.log('WSOL ATA already exists');
  }
  
  if (tx.instructions.length === 0) {
    console.log('Both ATAs already exist — nothing to do');
    return;
  }
  
  tx.feePayer = payer.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(payer);
  
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  console.log('Tx:', sig);
  await conn.confirmTransaction(sig, 'confirmed');
  console.log('ATAs created successfully!');
}

main().catch(e => { console.error(e); process.exit(1); });
