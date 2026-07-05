#!/usr/bin/env node
/**
 * Workflow: Temporarily change mint authority → create metadata → restore authority
 */
const { Connection, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, mintTo, getMint, setAuthority, AuthorityType } = require('@solana/spl-token');
const { Metaplex, keypairIdentity, bundlrStorage } = require('@metaplex-foundation/js');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const PROGRAM_ID = new PublicKey('4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM');
const GOLD_MINT = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
const CONFIG_PDA = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');
const METAPLEX_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

const keypair = require('./kp.json');
const wallet = require('./keypair_from_json')(keypair);

console.log('Wallet:', wallet.publicKey.toBase58());

const connection = new Connection(RPC_URL, 'confirmed');

// Anchor discriminators
function discriminator(name) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update('global:' + name).digest().slice(0, 8);
}

async function getGameConfig() {
  const config = await connection.getAccountInfo(CONFIG_PDA);
  if (!config) throw new Error('Config not found');
  // Anchor account: 8-byte discriminator + GameConfig fields
  // authority: Pubkey (32), session_price: u64 (8), game_duration: i64 (8), bump: u8 (1), decimals: u8 (1)
  const data = config.data;
  const authority = new PublicKey(data.slice(8, 40));
  console.log('Config authority:', authority.toBase58());
  return { authority, bump: data[48] };
}

async function createSetMintAuthorityIx(newAuthority) {
  // set_mint_authority accounts:
  // 0. game_config (mut)
  // 1. gold_mint (mut)
  // 2. old_authority (signer) = config PDA
  // 3. new_authority
  // 4. token_program
  const config = await getGameConfig();
  const seeds = [Buffer.from('silver_config_v2'), Buffer.from([config.bump])];
  
  const data = Buffer.concat([
    discriminator('set_mint_authority'),
    Buffer.from([1]), // Option::Some variant
    newAuthority.toBytes()
  ]);
  
  return {
    keys: [
      { pubkey: CONFIG_PDA, isSigner: false, isWritable: true },
      { pubkey: GOLD_MINT, isSigner: false, isWritable: true },
      { pubkey: CONFIG_PDA, isSigner: true, isWritable: false },
      { pubkey: newAuthority, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFNCd6HyCa2pL89J94S'), isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  };
}

async function createMetadataViaMetaplex() {
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(wallet));
  
  const { nft } = await metaplex.nfts().create({
    uri: 'https://gold-miner.vercel.app/token-metadata.json',
    name: 'Goldium',
    symbol: 'GOLD',
    sellerFeeBasisPoints: 0,
    useNewMint: false,
    useExistingMint: GOLD_MINT,
    tokenOwner: wallet.publicKey,
    updateAuthority: wallet,
    isMutable: true,
    tokenStandard: 2, // Fungible
  });
  
  console.log('Metadata created:', nft.address.toBase58());
  return nft.address;
}

async function main() {
  console.log('Step 1: Check current mint authority');
  const mintInfo = await getMint(connection, GOLD_MINT, 'confirmed', new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFNCd6HyCa2pL89J94S'));
  console.log('Current mint authority:', mintInfo.mintAuthority?.toBase58() || 'None');
  console.log('Current freeze authority:', mintInfo.freezeAuthority?.toBase58() || 'None');
  
  if (mintInfo.mintAuthority?.toBase58() === wallet.publicKey.toBase58()) {
    console.log('Wallet is already mint authority, creating metadata directly...');
    const metadata = await createMetadataViaMetaplex();
    console.log('Done! Metadata:', metadata.toBase58());
    return;
  }
  
  console.log('\nStep 2: Change mint authority to wallet');
  const setAuthIx = await createSetMintAuthorityIx(wallet.publicKey);
  const tx1 = new Transaction().add(setAuthIx);
  const sig1 = await sendAndConfirmTransaction(connection, tx1, [wallet], { commitment: 'confirmed' });
  console.log('Mint authority changed:', sig1);
  
  // Wait a bit
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('\nStep 3: Create metadata via Metaplex JS');
  const metadata = await createMetadataViaMetaplex();
  
  console.log('\nStep 4: Restore mint authority to config PDA');
  const restoreIx = await createSetMintAuthorityIx(CONFIG_PDA);
  const tx2 = new Transaction().add(restoreIx);
  const sig2 = await sendAndConfirmTransaction(connection, tx2, [wallet], { commitment: 'confirmed' });
  console.log('Mint authority restored:', sig2);
  
  console.log('\nDone! Metadata account:', metadata.toBase58());
}

main().catch(console.error);
