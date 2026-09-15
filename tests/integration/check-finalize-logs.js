const { Connection, PublicKey } = require('@solana/web3.js');
const RPC = 'https://x1-testnet.xen.network';
const connection = new Connection(RPC, 'confirmed');

async function main() {
  const sig = 'wzfLqieo14Dk3usu2u8Umaf2ER1yqNtx7S9JDJ6mBMoQHm7uWhtK9zUsLZquaCudGqmiq6Yw3jBYNcZKj4niwym';
  const tx = await connection.getTransaction(sig, { commitment: 'confirmed' });
  console.log('Transaction status:', tx.meta.err ? 'FAILED' : 'SUCCESS');
  if (tx.meta.logMessages) {
    console.log('Logs:');
    tx.meta.logMessages.forEach(l => console.log(' ', l));
  }
}
main().catch(console.error);
