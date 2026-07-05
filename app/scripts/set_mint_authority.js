const {
  Connection, PublicKey, Keypair, Transaction
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  createSetAuthorityInstruction,
  AuthorityType,
} = require('@solana/spl-token');
const fs = require('fs');

const RPC = 'https://rpc.testnet.x1.xyz';
const PAYER_KEYPAIR = '/home/jack/.config/solana/id.json';

const GOLD_MINT = new PublicKey('vKxnbuf4HeR6espPnfnVwaByaWgp3NHSGWGmjyNyrS6');
// The game_config PDA is what the contract uses to sign mint_to via CPI
const NEW_AUTHORITY = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR, 'utf8'))));
  
  console.log('Current authority (payer):', payer.publicKey.toBase58());
  console.log('New authority (game_config PDA):', NEW_AUTHORITY.toBase58());
  console.log('Mint:', GOLD_MINT.toBase58());
  
  // Transfer mint authority from payer to game_config PDA
  const ix = createSetAuthorityInstruction(
    GOLD_MINT,                // account (mint)
    payer.publicKey,          // current authority (signer)
    AuthorityType.MintTokens, // authority type
    NEW_AUTHORITY,            // new authority
    [],                       // multiSigners
    TOKEN_2022_PROGRAM_ID
  );
  
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(payer);
  
  console.log('Transferring mint authority...');
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  console.log('Tx:', sig);
  await conn.confirmTransaction(sig, 'confirmed');
  console.log('Mint authority transferred to game_config PDA!');
}

main().catch(e => { console.error(e); process.exit(1); });
