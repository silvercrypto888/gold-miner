const {Connection, PublicKey, Keypair, SystemProgram} = require('@solana/web3.js');
const {Program, AnchorProvider} = require('@coral-xyz/anchor');
const BN = require('bn.js');
const fs = require('fs');

const idl = {
  address: "EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf",
  metadata: { name: "gold_miner", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    { name: "withdrawXnt", discriminator: [129, 188, 47, 92, 90, 169, 6, 251],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
  ],
  accounts: [
    { name: "Player", discriminator: [205, 222, 112, 7, 165, 155, 206, 218] },
  ],
  types: [
    { name: "Player", type: { kind: "struct", fields: [
      { name: "wallet", type: "pubkey" },
      { name: "sessionKey", type: "pubkey" },
      { name: "positionX", type: "u32" },
      { name: "positionY", type: "u32" },
      { name: "goldiumMinted", type: "u64" },
      { name: "sessionExpiresAt", type: "u64" },
      { name: "bump", type: "u8" },
    ]}},
  ],
  errors: [],
};

const walletData = JSON.parse(fs.readFileSync('/home/jack/.config/solana/id.json', 'utf-8'));
const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
const conn = new Connection('https://rpc.testnet.x1.xyz', 'confirmed');
const provider = new AnchorProvider(conn, wallet, { commitment: 'confirmed' });
const program = new Program(idl, provider);
const [playerPda] = PublicKey.findProgramAddressSync([Buffer.from('player'), wallet.publicKey.toBuffer()], program.programId);

(async () => {
  const balBefore = await conn.getBalance(playerPda);
  const walletBalBefore = await conn.getBalance(wallet.publicKey);
  console.log('Player escrow before:', balBefore, 'lamports');
  console.log('Wallet balance before:', walletBalBefore, 'lamports');

  try {
    const tx = await program.methods.withdrawXnt()
      .accounts({
        wallet: wallet.publicKey,
        player: playerPda,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.feePayer = wallet.publicKey;
    tx.sign(wallet);
    const sig = await conn.sendRawTransaction(tx.serialize());
    console.log('TX:', sig);
    await conn.confirmTransaction(sig);
    const balAfter = await conn.getBalance(playerPda);
    const walletBalAfter = await conn.getBalance(wallet.publicKey);
    console.log('Player escrow after:', balAfter, 'lamports');
    console.log('Wallet balance after:', walletBalAfter, 'lamports');
    console.log('Withdrew:', balBefore - balAfter, 'lamports from escrow');
    console.log('Net wallet change:', walletBalAfter - walletBalBefore, 'lamports');
  } catch (err) {
    console.error('Error:', err.message);
    if (err.logs) console.error('Logs:', err.logs);
  }
})();
