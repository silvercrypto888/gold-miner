const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, TOKEN_2022_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const GOLD_MINT = 'EarL8NaAje3mx5UGC86CWByVnotKgibkGmuJh6bHcWdz';
const TREASURY_PDA = '36auCs8n3XBG7HYeFaGbsud3jaRdkk2hizq6oiNCAA4o';

const walletPath = process.env.ANCHOR_WALLET || '/home/jack/.config/solana/id.json';
const walletKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
);

const connection = new Connection(RPC_URL, 'confirmed');

async function main() {
  const goldMintPk = new PublicKey(GOLD_MINT);
  const treasuryPda = new PublicKey(TREASURY_PDA);
  
  // Check if treasury GOLD ATA already exists
  const ata = getAssociatedTokenAddressSync(
    goldMintPk,
    treasuryPda,
    true,  // allowOwnerOffCurve (for PDAs)
    TOKEN_2022_PROGRAM_ID
  );
  console.log('Treasury GOLD ATA:', ata.toBase58());
  
  const existing = await connection.getAccountInfo(ata);
  if (existing) {
    console.log('Treasury GOLD ATA already exists!');
    return;
  }
  
  console.log('Creating treasury GOLD ATA...');
  const ix = createAssociatedTokenAccountInstruction(
    walletKeypair.publicKey,  // payer
    ata,                        // ata address
    treasuryPda,                // owner
    goldMintPk,               // mint
    TOKEN_2022_PROGRAM_ID
  );
  
  const tx = new Transaction().add(ix);
  tx.feePayer = walletKeypair.publicKey;
  
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(walletKeypair);
  
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig);
  console.log('Treasury GOLD ATA created! TX:', sig);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
