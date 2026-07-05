#!/usr/bin/env node
/**
 * Create Metaplex metadata for GOLD via CPI using CreateV1 (unified, Token-2022 compatible).
 */
const { Connection, PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const PROGRAM_ID = new PublicKey('4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM');
const GOLD_MINT = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const CONFIG_PDA = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');
const METAPLEX_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const TOKEN_2022_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFNCd6HyCa2pL89J94S');
const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');

const keypairData = require('/home/jack/.config/solana/id.json');
const wallet = Keypair.fromSecretKey(Buffer.from(keypairData));

console.log('Wallet:', wallet.publicKey.toBase58());

const connection = new Connection(RPC_URL, 'confirmed');

function getMetadataPDA(mint) {
  const seeds = [
    Buffer.from('metadata'),
    METAPLEX_ID.toBuffer(),
    mint.toBuffer(),
  ];
  return PublicKey.findProgramAddressSync(seeds, METAPLEX_ID)[0];
}

const METADATA_PDA = getMetadataPDA(GOLD_MINT);
console.log('Metadata PDA:', METADATA_PDA.toBase58());

const crypto = require('crypto');
function discriminator(name) {
  return crypto.createHash('sha256').update('global:' + name).digest().slice(0, 8);
}

// Serialize a string as Borsh (4-byte LE length + utf8 bytes)
function borshString(s) {
  const buf = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

async function createMetadata() {
  const uri = 'https://gold-miner.vercel.app/token-metadata.json';
  
  const data = Buffer.concat([
    discriminator('create_metadata'),
    borshString(uri),
  ]);

  // Accounts for CreateMetadata (createV1 CPI):
  // 0. authority (signer, writable) - payer
  // 1. game_config (PDA, writable) - signs via CPI
  // 2. gold_mint (writable)
  // 3. metadata_account (writable)
  // 4. metaplex_program
  // 5. system_program
  // 6. sysvar_instructions
  // 7. token_program (Token-2022)
  const ix = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },     // 0: authority
      { pubkey: CONFIG_PDA, isSigner: false, isWritable: true },           // 1: game_config
      { pubkey: GOLD_MINT, isSigner: false, isWritable: true },             // 2: gold_mint
      { pubkey: METADATA_PDA, isSigner: false, isWritable: true },        // 3: metadata_account
      { pubkey: METAPLEX_ID, isSigner: false, isWritable: false },        // 4: metaplex_program
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // 5: system_program
      { pubkey: SYSVAR_INSTRUCTIONS, isSigner: false, isWritable: false }, // 6: sysvar_instructions
      { pubkey: TOKEN_2022_ID, isSigner: false, isWritable: false },       // 7: token_program
    ],
    programId: PROGRAM_ID,
    data,
  };

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(wallet);

  console.log('Sending transaction...');
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  console.log('Sent:', sig);
  await connection.confirmTransaction(sig, 'confirmed');
  console.log('Confirmed!');
}

createMetadata().catch(e => {
  console.error('Error:', e.message);
  if (e.logs) console.error('Logs:', e.logs);
});
