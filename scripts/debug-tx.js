const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://x1-testnet.xen.network', 'confirmed');
const sig = '5dSojPH7UmoKQ8WymDWxMFGEctpZdbkWBq6xrYe58aw2FoPJWvWj49DToqygSjX3ppcr7ywbAMNurQWDRMKFiwT3';

async function main() {
  const tx = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx) { console.log('TX not found'); return; }
  
  const msg = tx.transaction.message;
  console.log('=== Accounts ===');
  msg.accountKeys.forEach((a, i) => {
    const labels = [];
    if (msg.isAccountSigner(i)) labels.push('signer');
    if (msg.isAccountWritable(i)) labels.push('writable');
    console.log(i + ': ' + a.toBase58() + ' ' + labels.join(','));
  });
  
  console.log('\n=== Instructions ===');
  msg.instructions.forEach((ix, i) => {
    const prog = msg.accountKeys[ix.programIdIndex].toBase58();
    console.log('\nInstruction ' + i + ': Program = ' + prog);
    console.log('Accounts:');
    ix.accounts.forEach((accIdx, j) => {
      console.log('  [' + j + '] index ' + accIdx + ': ' + msg.accountKeys[accIdx].toBase58());
    });
    console.log('Data hex:', Buffer.from(ix.data).toString('hex'));
    console.log('Data length:', ix.data.length, 'bytes');
  });
  
  console.log('\n=== Logs ===');
  tx.meta.logMessages.forEach(l => console.log(l));
}
main().catch(e => console.error(e));
