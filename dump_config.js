const { Connection, PublicKey } = require('@solana/web3.js');
const RPC = 'https://x1-testnet.xen.network';
const connection = new Connection(RPC, 'confirmed');
const PROGRAM_ID = new PublicKey('J5SrYjfRKinc7irrWJ1nVHfB3VvpQPidi5rPfEpBHSTu');
const [gameConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('silver_config_v2')], PROGRAM_ID);

async function main() {
  const acc = await connection.getAccountInfo(gameConfigPda);
  console.log('Total length:', acc.data.length);
  console.log('First 20 bytes (hex):', Array.from(acc.data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('Bytes 100-118 (hex):', Array.from(acc.data.slice(100, 118)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('Last 10 bytes (hex):', Array.from(acc.data.slice(-10)).map(b => b.toString(16).padStart(2, '0')).join(' '));
}
main().catch(console.error);
