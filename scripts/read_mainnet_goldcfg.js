const Web3 = require("@solana/web3.js");
const { PublicKey, Connection } = Web3;

(async () => {
  const prog = new PublicKey("4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM");
  const seed = Buffer.from("silver_config_v2");
  // manual bump scan (createProgramAddress throws if result is on-curve)
  let pda = null;
  let bumpB = 0;
  for (let b = 255; b >= 0; b--) {
    try {
      pda = PublicKey.createProgramAddressSync([seed, Buffer.from([b])], prog);
      bumpB = b;
      break;
    } catch (e) { /* on-curve, try next bump */ }
  }
  if (!pda) { console.log("no PDA derived"); return; }
  console.log("GameConfig PDA:", pda.toBase58(), "bump:", bumpB);

  const endpoints = [
    "https://rpc.testnet.x1.xyz",
    "https://x1-testnet.xen.network",
  ];
  for (const rpc of endpoints) {
    try {
      const conn = new Connection(rpc, "confirmed");
      const info = await conn.getAccountInfo(pda);
      if (!info) { console.log(rpc, "-> no account at PDA"); continue; }
      console.log(rpc, "-> has account. len:", info.data.length, "owner:", info.owner.toBase58());
      const d = info.data;
      const authority = new PublicKey(d.slice(8, 40)).toBase58();
      const grid_size = d.readUInt32LE(40);
      const gold_mint = new PublicKey(d.slice(44, 76)).toBase58();
      const gold_bitmap = new PublicKey(d.slice(76, 108)).toBase58();
      const total_mined = d.readBigUInt64LE(108).toString();
      const immut = d[117];
      console.log("  authority  :", authority);
      console.log("  grid_size  :", grid_size);
      console.log("  gold_mint  :", gold_mint);
      console.log("  gold_bitmap:", gold_bitmap);
      console.log("  total_mined:", total_mined);
      console.log("  immutable  :", immut);
      break;
    } catch (e) {
      console.log(rpc, "ERR", e.message);
    }
  }
})();

// Also derive + read Treasury PDA and gold_bitmap
(async () => {
  const prog = new PublicKey("4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM");
  const cfgPda = new PublicKey("H4KYZGURjXfo1n7RkQXjiz7CvihLNV4ykP7bjFvE94aG");
  const seedT = Buffer.from("treasury");
  let treasury = null, tb=0;
  for (let b=255;b>=0;b--){
    try { treasury = PublicKey.createProgramAddressSync([seedT, cfgPda.toBuffer(), Buffer.from([b])], prog); tb=b; break; } catch(e){}
  }
  console.log("\nTreasury PDA:", treasury?.toBase58(), "bump:", tb);
  for (const rpc of ["https://rpc.testnet.x1.xyz","https://x1-testnet.xen.network"]) {
    try {
      const conn = new Connection(rpc, "confirmed");
      const ti = await conn.getAccountInfo(treasury);
      if (ti) {
        const d = ti.data;
        const gc = new PublicKey(d.slice(8,40)).toBase58();
        const gold_acc = d.readBigUInt64LE(40).toString();
        const xnt_acc = d.readBigUInt64LE(48).toString();
        const lp_burned = d.readBigUInt64LE(56).toString();
        console.log("  game_config :", gc);
        console.log("  gold_accum  :", gold_acc);
        console.log("  xnt_accum   :", xnt_acc);
        console.log("  lp_burned   :", lp_burned);
        break;
      } else console.log(rpc, "treasury no account");
    } catch(e){ console.log(rpc, "ERR", e.message); }
  }
  // gold_bitmap account: read first bytes
  const bmp = new PublicKey("HaphYcxXYfPbUCppeYkDNpVTZhdGcwbPQonwx7kTjzK5");
  for (const rpc of ["https://rpc.testnet.x1.xyz","https://x1-testnet.xen.network"]) {
    try {
      const conn = new Connection(rpc, "confirmed");
      const bi = await conn.getAccountInfo(bmp);
      if (bi) {
        console.log("\ngold_bitmap account: len", bi.data.length, "owner", bi.owner.toBase58());
        // print first 32 bytes as hex (grid dims/size field if u32)
        const d = bi.data;
        console.log("  first16 hex:", d.slice(0,16).toString("hex"));
        console.log("  u32[8]=grid_w?", d.readUInt32LE(8), " u32[12]=grid_h?", d.readUInt32LE(12));
        break;
      } else console.log(rpc, "bitmap no account");
    } catch(e){ console.log(rpc, "ERR", e.message); }
  }
})();
