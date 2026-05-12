const {
  Connection, PublicKey, Keypair, Transaction, SystemProgram,
} = require("@solana/web3.js");
const { Program, AnchorProvider, BN } = require("@coral-xyz/anchor");
const nacl = require("tweetnacl");
const fs = require("fs");

const RPC = "https://rpc.testnet.x1.xyz";
const PROGRAM_ID = new PublicKey("EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf");

// Load authority keypair
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("/home/jack/.config/solana/id.json", "utf-8")))
);

async function main() {
  const conn = new Connection(RPC, "confirmed");
  
  // Derive player PDA
  const [playerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), authority.publicKey.toBuffer()],
    PROGRAM_ID
  );
  
  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Player PDA:", playerPda.toBase58());
  
  // Fetch player account to check current position
  const playerInfo = await conn.getAccountInfo(playerPda);
  if (!playerInfo) {
    console.log("Player account not found!");
    return;
  }
  
  // Parse player data manually (Anchor format: 8-byte discriminator + fields)
  const data = playerInfo.data;
  // Discriminator: 8 bytes, then: wallet(32) + sessionKey(32) + positionX(4) + positionY(4)
  const posOffset = 8 + 32 + 32; // after disc + wallet + sessionKey
  const posX = data.readUInt32LE(posOffset);
  const posY = data.readUInt32LE(posOffset + 4);
  console.log(`Current position: (${posX}, ${posY})`);
  
  // Check session key
  const sessionKeyOffset = 8 + 32; // disc + wallet
  const sessionKeyBytes = data.slice(sessionKeyOffset, sessionKeyOffset + 32);
  const sessionKey = new PublicKey(sessionKeyBytes);
  console.log("Session key:", sessionKey.toBase58());
  console.log("Session key is default:", sessionKey.toBase58() === PublicKey.default.toBase58());
  
  if (sessionKey.toBase58() === PublicKey.default.toBase58()) {
    console.log("\nNo session key set! Need to start a session first.");
    return;
  }
  
  // Start a new session with a generated key
  const sessionKeypair = nacl.sign.keyPair();
  const sessionPubkey = new PublicKey(sessionKeypair.publicKey);
  
  console.log("\nStarting session with key:", sessionPubkey.toBase58());
  
  // Build startSession instruction using Anchor discriminator
  const startSessionDisc = Buffer.from([23, 227, 111, 142, 212, 230, 3, 175]);
  const sessionKeyBytesArg = sessionPubkey.toBuffer();
  
  const startIx = {
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: playerPda, isSigner: false, isWritable: true },
    ],
    programId: PROGRAM_ID,
    data: Buffer.concat([startSessionDisc, sessionKeyBytesArg]),
  };
  
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: authority.publicKey });
  tx.add(startIx);
  tx.sign(authority);
  
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  console.log("Session started! TX:", sig);
  
  // Now test movePlayer with session key
  // Direction enum: {Up: {}} = discriminator + variant index
  // Anchor enum: 8-byte discriminator + 1-byte variant index
  const movePlayerDisc = Buffer.from([17, 58, 68, 221, 186, 117, 140, 231]);
  // Direction::Right = variant index 3
  const directionRight = Buffer.from([3]);
  
  const sessionSigner = Keypair.fromSecretKey(sessionKeypair.secretKey);
  
  const moveIx = {
    keys: [
      { pubkey: sessionSigner.publicKey, isSigner: true, isWritable: false },  // session_signer
      { pubkey: playerPda, isSigner: false, isWritable: true },                // player
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    programId: PROGRAM_ID,
    data: Buffer.concat([movePlayerDisc, directionRight]),
  };
  
  const { blockhash: bh2, lastValidBlockHeight: lvbh2 } = await conn.getLatestBlockhash();
  const tx2 = new Transaction({ blockhash: bh2, lastValidBlockHeight: lvbh2, feePayer: authority.publicKey });
  tx2.add(moveIx);
  tx2.partialSign(sessionSigner);
  // Fee payer needs to sign too
  tx2.sign(authority);
  
  console.log("\nSending movePlayer (Right) transaction...");
  try {
    const sig2 = await conn.sendRawTransaction(tx2.serialize());
    console.log("Move TX:", sig2);
    await conn.confirmTransaction({ signature: sig2, blockhash: bh2, lastValidBlockHeight: lvbh2 });
    console.log("Move confirmed!");
    
    // Check new position
    const playerInfo2 = await conn.getAccountInfo(playerPda);
    const data2 = playerInfo2.data;
    const posX2 = data2.readUInt32LE(posOffset);
    const posY2 = data2.readUInt32LE(posOffset + 4);
    console.log(`New position: (${posX2}, ${posY2})`);
  } catch (err) {
    console.error("Move failed:", err.message);
    // Try to get logs
    if (err.logs) {
      console.error("Logs:", err.logs);
    }
  }
}

main().catch(console.error);