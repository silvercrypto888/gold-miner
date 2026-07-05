const {
  Connection, PublicKey, Keypair, Transaction, SystemProgram
} = require('@solana/web3.js');
const fs = require('fs');

const RPC = 'https://rpc.testnet.x1.xyz';
const PAYER_KEYPAIR = '/home/jack/.config/solana/id.json';

const PROGRAM_ID = new PublicKey('4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const GAME_CONFIG_PDA = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');
const NEW_GOLD_MINT = new PublicKey('vKxnbuf4HeR6espPnfnVwaByaWgp3NHSGWGmjyNyrS6');

// updateGoldMint discriminator
const DISC = Buffer.from([240, 238, 95, 74, 241, 241, 128, 117]);

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR, 'utf8'))));
  
  console.log('Payer:', payer.publicKey.toBase58());
  console.log('Current game config gold mint:');
  const acc = await conn.getAccountInfo(GAME_CONFIG_PDA);
  if (acc) {
    const data = Buffer.from(acc.data);
    const currentMint = data.slice(44, 76);
    console.log('Current gold mint:', new PublicKey(currentMint).toBase58());
  }
  
  // Build updateGoldMint instruction
  const keys = [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },     // authority
    { pubkey: GAME_CONFIG_PDA, isSigner: false, isWritable: true },  // gameConfig
    { pubkey: NEW_GOLD_MINT, isSigner: false, isWritable: true },       // newGoldMint
    { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false }, // tokenProgram
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // systemProgram
  ];
  
  const ix = {
    keys,
    programId: PROGRAM_ID,
    data: DISC,
  };
  
  const tx = new Transaction();
  tx.add(ix);
  tx.feePayer = payer.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(payer);
  
  console.log('Sending updateGoldMint...');
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  console.log('Tx:', sig);
  await conn.confirmTransaction(sig, 'confirmed');
  console.log('Confirmed!');
  
  // Verify
  const accAfter = await conn.getAccountInfo(GAME_CONFIG_PDA);
  if (accAfter) {
    const data = Buffer.from(accAfter.data);
    const newMint = data.slice(44, 76);
    console.log('Updated gold mint:', new PublicKey(newMint).toBase58());
  }
}

main().catch(e => { console.error(e); process.exit(1); });
