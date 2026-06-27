const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const MINT = 'EarL8NaAje3mx5UGC86CWByVnotKgibkGmuJh6bHcWdz';
const METAPLEX_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

const walletPath = process.env.ANCHOR_WALLET || '/home/jack/.config/solana/id.json';
const walletKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
);

const connection = new Connection(RPC_URL, 'confirmed');

// Metaplex create_metadata_accounts_v3 discriminator
const CREATE_METADATA_DISC = Buffer.from([33, 53, 112, 152, 15, 18, 109, 168]);

async function main() {
  const mint = new PublicKey(MINT);
  const metaplex = new PublicKey(METAPLEX_PROGRAM);
  
  // Derive metadata PDA
  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), metaplex.toBuffer(), mint.toBuffer()],
    metaplex
  );
  console.log('Metadata PDA:', metadataPda.toBase58());
  
  // Check if metadata already exists
  const existing = await connection.getAccountInfo(metadataPda);
  if (existing) {
    console.log('Metadata already exists!');
    return;
  }
  
  // Build create_metadata_accounts_v3 instruction
  // Data layout:
  // 0-7: discriminator
  // 8+: DataV2 struct (name, symbol, uri, sellerFeeBasisPoints, creators, collection, uses)
  
  const name = 'Silver Gold';
  const symbol = 'GOLD';
  const uri = 'https://gold-miner.vercel.app/token-metadata.json'; // placeholder URI
  
  // Serialize DataV2
  const nameBuf = Buffer.from(name);
  const symbolBuf = Buffer.from(symbol);
  const uriBuf = Buffer.from(uri);
  
  // DataV2 serialization (using Anchor-style serialization)
  // Option<bool> for creators, collection, uses
  const data = Buffer.concat([
    CREATE_METADATA_DISC,
    Buffer.from([nameBuf.length]),       // name length (u32 LE, but we'll use u8 for simplicity)
    nameBuf,
    Buffer.from([symbolBuf.length]),       // symbol length
    symbolBuf,
    Buffer.from([uriBuf.length]),          // uri length
    uriBuf,
    Buffer.from([0, 0]),                   // seller_fee_basis_points (u16 LE)
    Buffer.from([0]),                      // creators: Option<None>
    Buffer.from([0]),                      // collection: Option<None>
    Buffer.from([0]),                      // uses: Option<None>
  ]);
  
  console.log('Data length:', data.length);
  console.log('Data (hex):', data.toString('hex'));
  
  // Accounts for create_metadata_accounts_v3:
  // 0. metadata (writable)
  // 1. mint
  // 2. mint_authority (signer)
  // 3. payer (signer, writable)
  // 4. update_authority (signer)
  // 5. system_program
  // 6. rent_sysvar
  
  // Wait — the mint authority is the game_config PDA, not our wallet.
  // We need to sign with the wallet as both mint_authority AND update_authority.
  // But the program checks that mint_authority === signer for this instruction.
  // Since the mint authority is the game_config PDA, we can't sign with a wallet.
  // We'd need the game program to handle this via CPI.
  
  // Let me check if the wallet is actually the mint authority
  const mintInfo = await connection.getParsedAccountInfo(mint);
  console.log('Mint authority:', JSON.stringify(mintInfo.value?.data?.parsed?.info?.mintAuthority));
  
  // If mint authority is the wallet, we can proceed. If it's the PDA, we can't directly.
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
