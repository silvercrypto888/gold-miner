#!/usr/bin/env node
const { PublicKey, Connection, Keypair, Transaction, TransactionInstruction, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const RPC = "https://rpc.testnet.x1.xyz";
const PROG = new PublicKey("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");
const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const DIS = Buffer.from([44, 62, 102, 247, 126, 208, 130, 215]);

async function main() {
  const dep = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(process.env.HOME, ".config/solana/id.json"), "utf-8"))));
  const gm = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "gold-mint-keypair.json"), "utf-8")))).publicKey;

  const [cfg] = PublicKey.findProgramAddressSync([Buffer.from("game_config")], PROG);
  
  // Generate bitmap keypair
  const bmDir = path.dirname(__dirname);
  const bmPath = path.resolve(bmDir, "gold-bitmap-keypair.json");
  let bmKp;
  if (fs.existsSync(bmPath)) {
    bmKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(bmPath, "utf-8"))));
    console.log("Loaded bitmap keypair:", bmKp.publicKey.toString());
  } else {
    bmKp = Keypair.generate();
    fs.writeFileSync(bmPath, JSON.stringify(Array.from(bmKp.secretKey)));
    console.log("Generated bitmap keypair:", bmKp.publicKey.toString());
  }

  console.log("Deployer:", dep.publicKey.toString());
  console.log("GOLD:", gm.toString());
  console.log("Config:", cfg.toString());

  const conn = new Connection(RPC, "confirmed");
  const ex = await conn.getAccountInfo(cfg);
  if (ex) { console.log("\n✓ Already initialized!"); return; }

  // Create 128KB bitmap account (program-owned)
  const BM_SIZE = 131072;
  const lamports = await conn.getMinimumBalanceForRentExemption(BM_SIZE);
  console.log(`\nCreating bitmap (${(lamports/1e9).toFixed(4)} SOL)...`);

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: dep.publicKey, blockhash, lastValidBlockHeight });

  tx.add(SystemProgram.createAccount({
    fromPubkey: dep.publicKey,
    newAccountPubkey: bmKp.publicKey,
    lamports,
    space: BM_SIZE,
    programId: PROG,
  }));

  tx.add(new TransactionInstruction({
    programId: PROG,
    keys: [
      { pubkey: dep.publicKey, isSigner: true, isWritable: true },
      { pubkey: cfg, isSigner: false, isWritable: true },
      { pubkey: bmKp.publicKey, isSigner: false, isWritable: true },
      { pubkey: gm, isSigner: false, isWritable: true },
      { pubkey: T22, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DIS,
  }));

  console.log("Sending TX with create bitmap + init...");
  const sig = await conn.sendTransaction(tx, [dep, bmKp]);
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  const ci = await conn.getAccountInfo(cfg);
  const bmi = await conn.getAccountInfo(bmKp.publicKey);
  if (ci) console.log("✓ GameConfig:", ci.data.length, "bytes");
  if (bmi) console.log("✓ Bitmap:", bmi.data.length, "bytes (owner:", bmi.owner.toString(),")");
  
  console.log("\n.env.local:");
  console.log(`NEXT_PUBLIC_PROGRAM_ID=${PROG.toString()}`);
  console.log(`NEXT_PUBLIC_GOLD_MINT=${gm.toString()}`);
  console.log(`NEXT_PUBLIC_GOLD_BITMAP=${bmKp.publicKey.toString()}`);
  console.log(`NEXT_PUBLIC_RPC_URL=${RPC}`);
}

main().catch(e => { console.error("ERROR:", e); process.exit(1); });
