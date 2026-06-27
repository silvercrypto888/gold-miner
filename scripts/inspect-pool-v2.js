const { Connection, PublicKey } = require("@solana/web3.js");

const RPC = "https://rpc.testnet.x1.xyz";
const POOL = new PublicKey("EJpboMDrMkoc3ZkTW6C8CnKuyP94rM9RuJyfFwr7TYij");
const conn = new Connection(RPC, "confirmed");

function readPubkey(data, offset) {
  return new PublicKey(data.slice(offset, offset + 32));
}

async function main() {
  const poolInfo = await conn.getAccountInfo(POOL);
  if (!poolInfo) {
    console.log("Pool not found");
    return;
  }

  const data = poolInfo.data;
  console.log("Pool data length:", data.length, "bytes");
  console.log("\n=== Reading as CPMM-style pool ===\n");

  // CPMM pool layout (approximate):
  // 0-7:   discriminator
  // 8-39:  config
  // 40-71: authority (or creator, depending on version)
  // ... then vaults, mints, programs

  // Let's just dump all pubkeys at 32-byte intervals starting from offset 8
  for (let i = 8; i + 32 <= data.length; i += 32) {
    try {
      const pk = readPubkey(data, i);
      // Skip if it looks like zeros or invalid
      if (pk.toBase58() === "11111111111111111111111111111111") {
        console.log(`offset ${i}: (zeroed)`);
      } else {
        console.log(`offset ${i}: ${pk.toBase58()}`);
      }
    } catch (e) {
      console.log(`offset ${i}: <invalid>`);
    }
  }

  // Also check other addresses that might own token accounts
  console.log("\n=== Checking token accounts for pool-related addresses ===");
  
  const candidates = [
    POOL,
    new PublicKey("3rs8Yj4GYqHWgXdAeap2L1W94Kj1Ga3YVkPswHGhv7ji"),  // offset 72
    new PublicKey("61tYCBnU5sXTPUdQgfMPLCZR15XkFH2LbNPe5G2T6MrD"),  // offset 104
    new PublicKey("4xvww8Yb8kAQAKxRBgsCCBgFBq8YEqKEKSjvTzrno8Rm"),  // offset 136
    new PublicKey("D32A8xrkDK1a6Yi8Lwc9RBV4F9ueKVrzxR751o5PRbA5"),  // offset 296
  ];

  for (const addr of candidates) {
    const spl = await conn.getTokenAccountsByOwner(addr, { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") });
    const t22 = await conn.getTokenAccountsByOwner(addr, { programId: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") });
    
    const all = [...spl.value, ...t22.value];
    if (all.length > 0) {
      console.log(`\n${addr.toBase58()} owns ${all.length} token accounts:`);
      for (const ta of all) {
        const mint = new PublicKey(ta.account.data.slice(0, 32));
        console.log(`  ATA: ${ta.pubkey.toBase58()}, Mint: ${mint.toBase58()}`);
      }
    }
  }

  // Check if any of the offset addresses are token accounts themselves
  console.log("\n=== Checking if offset addresses are token accounts ===");
  for (const addrStr of [
    "3rs8Yj4GYqHWgXdAeap2L1W94Kj1Ga3YVkPswHGhv7ji",
    "61tYCBnU5sXTPUdQgfMPLCZR15XkFH2LbNPe5G2T6MrD",
    "4xvww8Yb8kAQAKxRBgsCCBgFBq8YEqKEKSjvTzrno8Rm",
    "D32A8xrkDK1a6Yi8Lwc9RBV4F9ueKVrzxR751o5PRbA5",
  ]) {
    const addr = new PublicKey(addrStr);
    const info = await conn.getAccountInfo(addr);
    if (!info) {
      console.log(`${addrStr}: NOT FOUND`);
      continue;
    }
    const owner = info.owner.toBase58();
    if (owner === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") {
      const mint = new PublicKey(info.data.slice(0, 32));
      const ataOwner = new PublicKey(info.data.slice(32, 64));
      console.log(`${addrStr}: SPL Token ATA (mint=${mint.toBase58()}, owner=${ataOwner.toBase58()})`);
    } else if (owner === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb") {
      const mint = new PublicKey(info.data.slice(0, 32));
      const ataOwner = new PublicKey(info.data.slice(32, 64));
      console.log(`${addrStr}: Token-2022 ATA (mint=${mint.toBase58()}, owner=${ataOwner.toBase58()})`);
    } else if (owner === "7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf") {
      console.log(`${addrStr}: Owned by AMM program`);
    } else {
      console.log(`${addrStr}: Owner=${owner}, len=${info.data.length}`);
    }
  }
}

main().catch(console.error);
