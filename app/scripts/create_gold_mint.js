const {
  Connection, Keypair, SystemProgram, Transaction
} = require('@solana/web3.js');
const {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMint2Instruction,
  createInitializeMetadataPointerInstruction,
  getMintLen,
} = require('@solana/spl-token');
const { pack } = require('@solana/spl-token-metadata');
const fs = require('fs');

const RPC = 'https://rpc.testnet.x1.xyz';
const PAYER_KEYPAIR = '/home/jack/.config/solana/id.json';

const MINT_KEYPAIR = Keypair.generate();
const DECIMALS = 9;
const NAME = 'Goldium';
const SYMBOL = 'GOLD';
const URI = 'https://arweave.net/cxmHUDnAAt9jUV4RDiEFM5jkoUCR8awzIcnSpcD1r5o';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR, 'utf8'))));
  console.log('Payer:', payer.publicKey.toBase58());
  console.log('Balance:', await conn.getBalance(payer.publicKey));
  console.log('New mint:', MINT_KEYPAIR.publicKey.toBase58());
  
  // Use InitializeMint2 (no signer required for mint)
  // 1. Create account with space for extensions
  const packedMetadata = pack({
    updateAuthority: payer.publicKey,
    mint: MINT_KEYPAIR.publicKey,
    name: NAME,
    symbol: SYMBOL,
    uri: URI,
    additionalMetadata: []
  });
  const packedLen = packedMetadata.length;
  console.log('Packed metadata length:', packedLen);
  
  const extensions = []; // Don't allocate TokenMetadata up front
  const mintLen = 82; // Start with basic mint size
  const lamports = await conn.getMinimumBalanceForRentExemption(82);
  console.log('Mint length:', mintLen, 'Lamports:', lamports);
  
  const createAcctIx = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: MINT_KEYPAIR.publicKey,
    space: mintLen,
    lamports,
    programId: TOKEN_2022_PROGRAM_ID,
  });
  
  // Use InitializeMint2 (no signer requirement)
  const initMint2Ix = createInitializeMint2Instruction(
    MINT_KEYPAIR.publicKey,
    DECIMALS,
    payer.publicKey,
    null,
    TOKEN_2022_PROGRAM_ID
  );
  
  const tx = new Transaction();
  tx.add(createAcctIx);
  tx.add(initMint2Ix);
  
  tx.feePayer = payer.publicKey;
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(payer, MINT_KEYPAIR);
  
  console.log('Sending init-mint2 transaction...');
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  console.log('Tx:', sig);
  await conn.confirmTransaction(sig, 'confirmed');
  console.log('Mint initialized with InitializeMint2!');
  
  // Check mint
  const { getMint } = require('@solana/spl-token');
  const mintInfo = await getMint(conn, MINT_KEYPAIR.publicKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
  console.log('Mint authority:', mintInfo.mintAuthority?.toBase58());
  console.log('Space:', (await conn.getAccountInfo(MINT_KEYPAIR.publicKey)).data.length);
  
  // Now try to add MetadataPointer extension using reallocate
  console.log('\n--- Testing MetadataPointer ---');
  
  // Need to use Reallocate to extend account for MetadataPointer
  // First, let's see if reallocate is available
  const { createReallocateInstruction } = require('@solana/spl-token');
  console.log('createReallocateInstruction:', typeof createReallocateInstruction);
  
  // Reallocate adds extension space to an existing mint
  const reallocateIx = createReallocateInstruction(
    MINT_KEYPAIR.publicKey,
    payer.publicKey,
    [require('@solana/spl-token').ExtensionType.MetadataPointer],
    payer.publicKey,
    TOKEN_2022_PROGRAM_ID
  );
  
  const reallocateTx = new Transaction();
  reallocateTx.add(reallocateIx);
  reallocateTx.feePayer = payer.publicKey;
  const rbh = await conn.getLatestBlockhash();
  reallocateTx.recentBlockhash = rbh.blockhash;
  reallocateTx.sign(payer);
  
  console.log('Sending reallocate...');
  const sig2 = await conn.sendRawTransaction(reallocateTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  console.log('Reallocate tx:', sig2);
  await conn.confirmTransaction(sig2, 'confirmed');
  console.log('Reallocated! New space:', (await conn.getAccountInfo(MINT_KEYPAIR.publicKey)).data.length);
  
  // Now initialize MetadataPointer
  const initMetadataPointerIx = createInitializeMetadataPointerInstruction(
    MINT_KEYPAIR.publicKey,
    payer.publicKey,
    MINT_KEYPAIR.publicKey,
    TOKEN_2022_PROGRAM_ID
  );
  
  const mpTx = new Transaction();
  mpTx.add(initMetadataPointerIx);
  mpTx.feePayer = payer.publicKey;
  const mpbh = await conn.getLatestBlockhash();
  mpTx.recentBlockhash = mpbh.blockhash;
  mpTx.sign(payer);
  
  console.log('Sending init MetadataPointer...');
  const sig3 = await conn.sendRawTransaction(mpTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  console.log('MetadataPointer tx:', sig3);
  await conn.confirmTransaction(sig3, 'confirmed');
  console.log('MetadataPointer initialized!');
  
  // Now reallocate for TokenMetadata
  const reallocateMetadataIx = createReallocateInstruction(
    MINT_KEYPAIR.publicKey,
    payer.publicKey,
    [require('@solana/spl-token').ExtensionType.TokenMetadata],
    payer.publicKey,
    TOKEN_2022_PROGRAM_ID
  );
  
  const rmTx = new Transaction();
  rmTx.add(reallocateMetadataIx);
  rmTx.feePayer = payer.publicKey;
  const rmbh = await conn.getLatestBlockhash();
  rmTx.recentBlockhash = rmbh.blockhash;
  rmTx.sign(payer);
  
  console.log('Sending reallocate for TokenMetadata...');
  const sig4 = await conn.sendRawTransaction(rmTx.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  console.log('Reallocate tx:', sig4);
  await conn.confirmTransaction(sig4, 'confirmed');
  console.log('Reallocated for TokenMetadata! New space:', (await conn.getAccountInfo(MINT_KEYPAIR.publicKey)).data.length);
  
  // Initialize TokenMetadata
  const { tokenMetadataInitializeWithRentTransfer, getTokenMetadata } = require('@solana/spl-token');
  const sig5 = await tokenMetadataInitializeWithRentTransfer(
    conn,
    payer,
    MINT_KEYPAIR.publicKey,
    payer.publicKey,
    payer.publicKey,
    NAME,
    SYMBOL,
    URI
  );
  console.log('TokenMetadata init tx:', sig5);
  await conn.confirmTransaction(sig5, 'confirmed');
  console.log('TokenMetadata initialized!');
  
  // Verify
  console.log('\n--- Verification ---');
  console.log('Mint address:', MINT_KEYPAIR.publicKey.toBase58());
  
  const meta = await getTokenMetadata(conn, MINT_KEYPAIR.publicKey);
  if (meta) {
    console.log('On-chain metadata:');
    console.log('  Name:', meta.name);
    console.log('  Symbol:', meta.symbol);
    console.log('  URI:', meta.uri);
    console.log('  Update authority:', meta.updateAuthority?.toBase58());
  } else {
    console.log('No on-chain metadata found');
  }
  
  const finalInfo = await getMint(conn, MINT_KEYPAIR.publicKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
  console.log('Mint authority:', finalInfo.mintAuthority?.toBase58());
  console.log('Decimals:', finalInfo.decimals);
  
  console.log('\n--- Summary ---');
  console.log('New GOLD mint:', MINT_KEYPAIR.publicKey.toBase58());
}

main().catch(e => { console.error(e); process.exit(1); });
