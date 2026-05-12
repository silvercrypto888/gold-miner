const {Connection, PublicKey, Keypair, SystemProgram} = require('@solana/web3.js');
const {Program, AnchorProvider} = require('@coral-xyz/anchor');
const BN = require('bn.js');

const idl = {
  address: "EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf",
  metadata: { name: "gold_miner", version: "0.1.0", spec: "0.1.0", description: "Gold Miner game on X1/Solana" },
  instructions: [
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
    {
      name: "joinGame",
      discriminator: [107, 112, 18, 38, 56, 173, 60, 128],
      accounts: [
        { name: "wallet", writable: true, signer: true },
        { name: "player", writable: true },
        { name: "systemProgram", address: "11111111111111111111111111" },
      ],
      args: [],
    },
  ],
  accounts: [
    { name: "GameConfig", discriminator: [45, 146, 146, 33, 170, 69, 96, 133] },
    { name: "Player", discriminator: [205, 222, 112, 7, 165, 155, 206, 218] },
    { name: "GoldSpot", discriminator: [112, 156, 149, 108, 70, 90, 135, 242] },
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
    {
      name: "GoldSpot",
      type: { kind: "struct", fields: [
        { name: "hasGold", type: "bool" },
        { name: "minedBy", type: { option: "pubkey" } },
      ]},
    },
    {
      name: "Direction",
      type: { kind: "enum", variants: [
        { name: "Up" }, { name: "Down" }, { name: "Left" }, { name: "Right" },
      ]},
    },
  ],
  errors: [],
};

async function main() {
  const wallet = Keypair.generate();
  const conn = new Connection('https://rpc.testnet.x1.xyz', 'confirmed');
  const provider = new AnchorProvider(conn, {
    publicKey: wallet.publicKey,
    signTransaction: async (tx) => tx,
  }, { commitment: 'confirmed' });

  try {
    const program = new Program(idl, provider);
    console.log('Program created OK');
    console.log('Methods:', Object.keys(program.methods));

    const playerPda = PublicKey.findProgramAddressSync(
      [Buffer.from('player'), wallet.publicKey.toBuffer()],
      program.programId
    )[0];

    // Build depositXnt instruction
    const ix = await program.methods.depositXnt(new BN(1000000))
      .accounts({
        wallet: wallet.publicKey,
        player: playerPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    console.log('\nInstruction built successfully!');
    console.log('Program ID:', ix.programId.toBase58());
    console.log('Data length:', ix.data.length);
    console.log('Data (hex):', Buffer.from(ix.data).toString('hex'));
    console.log('Data first 8 bytes:', Array.from(ix.data.subarray(0, 8)));
    console.log('Keys:', ix.keys.map(k => ({ pubkey: k.pubkey.toBase58(), writable: k.isWritable, signer: k.isSigner })));
  } catch (err) {
    console.error('Error:', err.message);
    if (err.stack) console.error(err.stack);
  }
}

main();
