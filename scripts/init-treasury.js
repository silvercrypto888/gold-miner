const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { Program, AnchorProvider, web3 } = require('@coral-xyz/anchor');
const fs = require('fs');

const RPC_URL = 'https://rpc.testnet.x1.xyz';
const PROGRAM_ID = '4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM';

// Load wallet from Solana CLI default keypair
const walletPath = process.env.ANCHOR_WALLET || '/home/jack/.config/solana/id.json';
const walletKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
);

const connection = new Connection(RPC_URL, 'confirmed');
const wallet = {
  publicKey: walletKeypair.publicKey,
  signTransaction: async (tx) => {
    tx.partialSign(walletKeypair);
    return tx;
  },
  signAllTransactions: async (txs) => {
    txs.forEach(tx => tx.partialSign(walletKeypair));
    return txs;
  },
};

const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

// Minimal IDL just for initTreasury
const idl = {
  address: PROGRAM_ID,
  metadata: { name: 'gold_miner', version: '0.2.0', spec: '0.1.0' },
  instructions: [
    {
      name: 'initTreasury',
      discriminator: [105, 152, 173, 51, 158, 151, 49, 14],
      accounts: [
        { name: 'authority', writable: true, signer: true },
        { name: 'gameConfig', writable: true },
        { name: 'treasury', writable: true },
        { name: 'systemProgram', address: '11111111111111111111111111111111' },
      ],
      args: [],
    },
  ],
};

const program = new Program(idl, provider);

async function main() {
  console.log('Wallet:', walletKeypair.publicKey.toBase58());
  
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('silver_config_v2')],
    new PublicKey(PROGRAM_ID)
  );
  console.log('Config PDA:', configPda.toBase58());
  
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury'), configPda.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
  console.log('Treasury PDA:', treasuryPda.toBase58());
  
  // Check if treasury already exists
  const existing = await connection.getAccountInfo(treasuryPda);
  if (existing) {
    console.log('Treasury already exists!');
    return;
  }
  
  console.log('Initializing treasury...');
  const tx = await program.methods
    .initTreasury()
    .accounts({
      authority: walletKeypair.publicKey,
      gameConfig: configPda,
      treasury: treasuryPda,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();
  
  console.log('Treasury initialized! TX:', tx);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
