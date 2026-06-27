const { Connection, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync } = require("@solana/spl-token");

const RPC = "https://rpc.testnet.x1.xyz";
const conn = new Connection(RPC, "confirmed");

const PROGRAM_ID = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const TREASURY_PDA = new PublicKey("8NK7dBvzJ9MmTDWjfX3AAW2fkWGewNsGsqE2HWf847Wv");
const NEW_LP_MINT = new PublicKey("4uQeVvV83A6y8iA5PmeydTybhLpJpMNzFxK6jEJdDCj");
const OLD_LP_MINT = new PublicKey("cWf87wGwVpv1TfMac8PimFmEPi1W4WqguFi2vEWQqkL");
const XNT_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const GOLD_MINT = new PublicKey("HAPJsAGEXkeE41VqcytFfUm3fMWiiz5baJFvCpDziyTa");

async function main() {
  console.log("=== Treasury PDA:", TREASURY_PDA.toBase58(), "===\n");

  const tokenkeg = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const tokenz = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

  // Check treasury GOLD ATA
  const goldAta = getAssociatedTokenAddressSync(GOLD_MINT, TREASURY_PDA, true, tokenz);
  const goldInfo = await conn.getAccountInfo(goldAta);
  console.log(`GOLD ATA (${goldAta.toBase58()}): ${goldInfo ? 'EXISTS' : 'NOT FOUND'}`);

  // Check treasury XNT ATA (Tokenkeg)
  const xntAta = getAssociatedTokenAddressSync(XNT_MINT, TREASURY_PDA, true, tokenkeg);
  const xntInfo = await conn.getAccountInfo(xntAta);
  console.log(`XNT ATA (${xntAta.toBase58()}): ${xntInfo ? 'EXISTS' : 'NOT FOUND'}`);

  // Check treasury OLD LP ATA
  const oldLpAta = getAssociatedTokenAddressSync(OLD_LP_MINT, TREASURY_PDA, true, tokenkeg);
  const oldLpInfo = await conn.getAccountInfo(oldLpAta);
  console.log(`OLD LP ATA (${oldLpAta.toBase58()}): ${oldLpInfo ? 'EXISTS' : 'NOT FOUND'}`);

  // Check treasury NEW LP ATA
  const newLpAta = getAssociatedTokenAddressSync(NEW_LP_MINT, TREASURY_PDA, true, tokenkeg);
  const newLpInfo = await conn.getAccountInfo(newLpAta);
  console.log(`NEW LP ATA (${newLpAta.toBase58()}): ${newLpInfo ? 'EXISTS' : 'NOT FOUND'}`);

  if (!newLpInfo) {
    console.log("\n❌ NEW LP ATA missing! Need to create it.");
  }

  // Also check treasury balance in GOLD ATA
  if (goldInfo) {
    const balance = goldInfo.data.readBigUInt64LE(64);
    console.log(`\nTreasury GOLD balance: ${balance}`);
  }
}

main().catch(console.error);
