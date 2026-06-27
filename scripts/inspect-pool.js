const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = "https://rpc.testnet.x1.xyz";
const POOL = new PublicKey("EJpboMDrMkoc3ZkTW6C8CnKuyP94rM9RuJyfFwr7TYij");
const conn = new Connection(RPC, "confirmed");

async function main() {
  console.log("=== Inspecting Pool:", POOL.toBase58(), "===\n");

  const poolInfo = await conn.getAccountInfo(POOL);
  if (!poolInfo) {
    console.log("❌ Pool not found");
    return;
  }

  console.log("Pool data length:", poolInfo.data.length, "bytes");
  console.log("Pool owner:", poolInfo.owner.toBase58());

  // The pool account layout for most AMMs is:
  // - discriminator (8 bytes)
  // - various fields
  // Let's try to extract key addresses by looking at offsets
  // Common layout (based on raydium/cpmm style):
  // After discriminator, there are usually pubkey fields

  const data = poolInfo.data;

  // Try reading pubkeys from known offsets
  const offsets = [8, 40, 72, 104, 136, 168, 200, 232, 264, 296];
  console.log("\nPossible pubkeys in pool account:");
  offsets.forEach((off, i) => {
    if (off + 32 <= data.length) {
      try {
        const pk = new PublicKey(data.slice(off, off + 32));
        console.log(`  offset ${off}: ${pk.toBase58()}`);
      } catch (e) {}
    }
  });

  // Also let's get token accounts owned by the pool
  console.log("\n=== Fetching token accounts for pool ===");
  
  // Get all token accounts
  const tokenAccounts = await conn.getTokenAccountsByOwner(POOL, { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") });
  const token2022Accounts = await conn.getTokenAccountsByOwner(POOL, { programId: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") });

  console.log("\nSPL Token accounts (Tokenkeg):");
  for (const ta of tokenAccounts.value) {
    const mint = new PublicKey(ta.account.data.slice(0, 32));
    console.log(`  ATA: ${ta.pubkey.toBase58()}, Mint: ${mint.toBase58()}`);
  }

  console.log("\nToken-2022 accounts:");
  for (const ta of token2022Accounts.value) {
    const mint = new PublicKey(ta.account.data.slice(0, 32));
    console.log(`  ATA: ${ta.pubkey.toBase58()}, Mint: ${mint.toBase58()}`);
  }

  // Check if pool is a token account itself (some DEXes have pool as ATA)
  console.log("\n=== Pool as token account? ===");
  if (poolInfo.data.length === 165) {
    const mint = new PublicKey(poolInfo.data.slice(0, 32));
    const owner = new PublicKey(poolInfo.data.slice(32, 64));
    console.log(`Pool is a token account: mint=${mint.toBase58()}, owner=${owner.toBase58()}`);
  }

  // Look at recent transactions to understand pool structure
  console.log("\n=== Recent Pool Transactions ===");
  const sigs = await conn.getSignaturesForAddress(POOL, { limit: 5 });
  for (const sig of sigs) {
    console.log(`  ${sig.signature.slice(0, 20)}... | err: ${sig.err ? JSON.stringify(sig.err) : 'OK'}`);
  }
}

main().catch(console.error);
