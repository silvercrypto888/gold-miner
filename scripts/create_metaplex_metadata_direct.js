// Create Metaplex metadata for GOLD token directly using mpl-token-metadata SDK
// Uses the game_config PDA as update authority

const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { createMetadataAccountV3, PROGRAM_ID: MPL_PROGRAM_ID } = require('@metaplex-foundation/mpl-token-metadata');
const { publicKey, signerIdentity, createUmi } = require('@metaplex-foundation/umi');
const { fromWeb3JsPublicKey } = require('@metaplex-foundation/umi-web3js-adapters');
const { mplTokenMetadata } = require('@metaplex-foundation/mpl-token-metadata');
const fs = require('fs');
const path = require('path');

// ── Constants ──────────────────────────────────────────────
const RPC_URL = 'https://rpc.testnet.x1.xyz';
const METAPLEX_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Load wallet
const walletPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME, '.config', 'solana', 'id.json');
const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey));

console.log('Wallet:', wallet.publicKey.toBase58());

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');

  // GOLD mint (Token-2022)
  const goldMint = new PublicKey('FEksZivLhY8LFhuNrtgyke8hTGJV498iybFViapzSdAX');
  console.log('Gold mint:', goldMint.toBase58());

  // Game config PDA (mint authority)
  const configPda = new PublicKey('H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG');
  console.log('Config PDA (mint authority):', configPda.toBase58());

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
    console.log('Owner:', metadataAccount.owner.toBase58());
    return;
  }

  console.log('Metadata does not exist. Creating via direct Metaplex call...');

  // Use UMI for Metaplex interaction
  const umi = createUmi().use(mplTokenMetadata());
  umi.use(signerIdentity({
    publicKey: fromWeb3JsPublicKey(wallet.publicKey),
    secretKey: () => wallet.secretKey,
    signMessage: async (msg) => wallet.sign(msg),
    signTransaction: async (tx) => {
      tx.addSignature(fromWeb3JsPublicKey(wallet.publicKey), await wallet.sign(tx.message));
      return tx;
    },
    signAllTransactions: async (txs) => {
      for (const tx of txs) {
        tx.addSignature(fromWeb3JsPublicKey(wallet.publicKey), await wallet.sign(tx.message));
      }
      return txs;
    },
  }));

  const mintPublicKey = fromWeb3JsPublicKey(goldMint);
  const authorityPublicKey = fromWeb3JsPublicKey(wallet.publicKey);
  const updateAuthority = fromWeb3JsPublicKey(configPda); // Use config PDA as update authority

  // Build create metadata instruction
  const instruction = createMetadataAccountV3(umi, {
    metadata: fromWeb3JsPublicKey(metadataPda),
    mint: mintPublicKey,
    mintAuthority: authorityPublicKey,   // Must sign to create metadata
    payer: authorityPublicKey,
    updateAuthority: updateAuthority,
    data: {
      name: 'Goldium',
      symbol: 'GOLD',
      uri: 'https://gold-miner.vercel.app/token-metadata.json',
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    },
    isMutable: true,
    collectionDetails: null,
  }).getInstructions()[0];

  console.log('Building transaction...');
  const transaction = new Transaction().add({
    keys: instruction.keys.map(k => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    programId: new PublicKey(instruction.programId),
    data: Buffer.from(instruction.data),
  });

  console.log('Sending transaction...');
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet],
    { commitment: 'confirmed' }
  );

  console.log('✅ Metadata created!');
  console.log('Transaction:', signature);

  // Verify
  const metadataAfter = await connection.getAccountInfo(metadataPda);
  if (metadataAfter) {
    console.log('✅ Metadata account exists');
    console.log('  Owner:', metadataAfter.owner.toBase58());
    console.log('  Size:', metadataAfter.data.length, 'bytes');
  } else {
    console.log('❌ Metadata account not found');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.logs) console.error('Logs:', err.logs);
  process.exit(1);
});
