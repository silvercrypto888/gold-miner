const {Connection, PublicKey, Keypair, SystemProgram, Transaction} = require('@solana/web3.js');
const {Program, AnchorProvider} = require('@coral-xyz/anchor');
const BN = require('bn.js');

const idl = {
  address: "EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf",
  metadata: { name: "gold_miner", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "joinGame",
      discriminator: [107, 112, 18, 38, 56, 173, 60, 128],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [],
    },
    {
      name: "depositXnt",
      discriminator: [174, 84, 153, 146, 93, 0, 115, 244],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
        { name: "systemProgram", address: "11111111111111111111111111111111" },
      ],
      args: [{ name: "amountLamports", type: "u64" }],
    },
  ],
  accounts: [
    { name: "GameConfig", discriminator: [45, 146, 146, 33, 170, 69, 96, 133] },
    { name: "Player", discriminator: [205, 222, 112, 7, 165, 155, 206, 218] },
  ],
  types: [
    {
      name: "GameConfig",
      type: { kind: "struct", fields: [
        { name: "authority", type: "pubkey" },
        { name: "gridSize", type: "u32" },
        { name: "goldiumMint", type: "pubkey" },
        { name: "totalGoldMined", type: "u64" },
        { name: "moveFeeLamports", type: "u64" },
        { name: "bump", type: "u8" },
      ]},
    },
    {
      name: "Player",
      type: { kind: "struct", fields: [
        { name: "wallet", type: "pubkey" },
        { name: "sessionKey", type: "pubkey" },
        { name: "positionX", type: "u32" },
        { name: "positionY", type: "u32" },
        { name: "goldiumMinted", type: "u64" },
        { name: "sessionExpiresAt", type: "u64" },
        { name: "bump", type: "u8" },
      ]},
    },
  ],
  errors: [],
};

const fs = require('fs');
const walletData = JSON.parse(fs.readFileSync('/home/jack/.config/solana/id.json', 'utf-8'));
const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));

async function main() {
  const conn = new Connection('https://rpc.testnet.x1.xyz', 'confirmed');
  const provider = new AnchorProvider(conn, wallet, { commitment: 'confirmed' });
  const program = new Program(idl, provider);

  const [playerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('player'), wallet.publicKey.toBuffer()],
    program.programId
  );
  console.log('Wallet:', wallet.publicKey.toBase58());
  console.log('Player PDA:', playerPda.toBase58());

  // Check if player exists
  const playerAcc = await conn.getAccountInfo(playerPda);
  if (!playerAcc) {
    console.log('Player does not exist, joining game first...');
    const joinTx = await program.methods.joinGame()
      .accounts({
        wallet: wallet.publicKey,
        player: playerPda,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    joinTx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    joinTx.feePayer = wallet.publicKey;
    joinTx.sign(wallet);
    const sig = await conn.sendRawTransaction(joinTx.serialize());
    await conn.confirmTransaction(sig);
    console.log('Joined! TX:', sig);
  } else {
    console.log('Player exists');
  }

  // Now deposit
  console.log('\nDepositing 0.02 XNT...');
  const depositIx = await program.methods.depositXnt(new BN(20_000_000))
    .accounts({
      wallet: wallet.publicKey,
      player: playerPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(depositIx);
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;
  tx.sign(wallet);

  const sig = await conn.sendRawTransaction(tx.serialize());
  console.log('TX sent:', sig);
  const result = await conn.confirmTransaction(sig);
  if (result.value.err) {
    console.error('Failed:', result.value.err);
  } else {
    console.log('Deposit successful!');
    const player = await program.account.player.fetch(playerPda);
    console.log('Player:', player);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.logs) console.error('Logs:', err.logs);
});
