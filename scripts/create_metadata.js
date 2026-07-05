const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } = require('@solana/web3.js');
const { AnchorProvider, Program, web3, utils } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Constants ──────────────────────────────────────────────
const RPC_URL = 'https://rpc.testnet.x1.xyz';
const PROGRAM_ID = new PublicKey('4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM');
const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const CONFIG_SEED = 'silver_config_v2';

// Load wallet
const walletPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME, '.config', 'solana', 'id.json');
const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));

console.log('Wallet:', wallet.publicKey.toBase58());

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');

  // Get config PDA
  const [configPda, configBump] = PublicKey.findProgramAddressSync(
    [Buffer.from(CONFIG_SEED)],
    PROGRAM_ID
  );
  console.log('Config PDA:', configPda.toBase58());

  // Read gold_mint from config account
  const configAccount = await connection.getAccountInfo(configPda);
  // GameConfig layout: disc(8) + authority(32) + grid_size(4) + gold_mint(32) + ...
  const goldMint = new PublicKey(configAccount.data.subarray(44, 76));
  console.log('Gold mint:', goldMint.toBase58());

  // Derive metadata PDA
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METAPLEX_PROGRAM_ID.toBuffer(),
      goldMint.toBuffer(),
    ],
    METAPLEX_PROGRAM_ID
  );
  console.log('Metadata PDA:', metadataPda.toBase58());

  // Check if metadata already exists
  const metadataAccount = await connection.getAccountInfo(metadataPda);
  if (metadataAccount) {
    console.log('Metadata account already exists! No need to create.');
    return;
  }

  // Compute Anchor discriminator for create_metadata
  const discriminator = crypto.createHash('sha256').update('global:create_metadata').digest().subarray(0, 8);
  console.log('Discriminator:', Buffer.from(discriminator).toString('hex'));

  // Serialize data: just the URI string (Borsh: u32 len + bytes)
  const uri = 'https://gold-miner.vercel.app/token-metadata.json';
  const uriBytes = Buffer.from(uri, 'utf-8');
  const uriLen = Buffer.alloc(4);
  uriLen.writeUInt32LE(uriBytes.length, 0);
  const data = Buffer.concat([discriminator, uriLen, uriBytes]);
  console.log('Instruction data length:', data.length);

  // Build the transaction
  const tx = new Transaction().add(
    new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },   // authority (payer + signer)
        { pubkey: configPda, isSigner: false, isWritable: true },          // game_config (needs mut for PDA signer seed)
        { pubkey: goldMint, isSigner: false, isWritable: false },          // gold_mint
        { pubkey: metadataPda, isSigner: false, isWritable: true },       // metadata_account
        { pubkey: METAPLEX_PROGRAM_ID, isSigner: false, isWritable: false }, // metaplex_program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        { pubkey: web3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },   // rent
      ],
      programId: PROGRAM_ID,
      data: data,
    })
  );

  // Set fee payer and recent blockhash
  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  // Sign and send
  tx.sign(wallet);
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  console.log('Transaction sent:', signature);
  console.log('Waiting for confirmation...');
  await connection.confirmTransaction(signature, 'confirmed');
  console.log('✅ Metadata created!');

  // Verify
  const metadataAfter = await connection.getAccountInfo(metadataPda);
  if (metadataAfter) {
    console.log('✅ Metadata account exists with', metadataAfter.data.length, 'bytes');
    // Parse metadata: version(1) + key(1) + update_auth(32) + mint(32) + name_offset...
    console.log('Owner:', metadataAfter.owner.toBase58());
  } else {
    console.log('❌ Metadata account not found');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.logs) console.error('Logs:', err.logs);
  process.exit(1);
});
