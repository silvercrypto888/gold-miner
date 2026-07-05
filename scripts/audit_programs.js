const { Connection, PublicKey } = require('@solana/web3.js');

async function main() {
  const conn = new Connection('https://rpc.testnet.x1.xyz', 'confirmed');
  
  const knownPrograms = [
    { name: 'Old v1 (4GQU)', id: '4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM' },
    { name: 'V2 (GLDF)', id: 'GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6' },
    { name: 'V3 (finalize_game)', id: '4GkZ3snMDedRn9BRvUtH1rx24AqzpDCZj7VP7WXGfZUr' },
  ];
  
  const results = [];
  
  for (const p of knownPrograms) {
    try {
      const acc = await conn.getAccountInfo(new PublicKey(p.id));
      if (acc) {
        results.push({
          name: p.name, id: p.id, exists: true,
          executable: acc.executable, owner: acc.owner.toBase58(),
          dataSize: acc.data.length, lamports: acc.lamports
        });
        console.log(p.name + ': ' + p.id);
        console.log('  Executable: ' + acc.executable);
        console.log('  Owner: ' + acc.owner.toBase58());
        console.log('  Data size: ' + acc.data.length);
        console.log('  Lamports: ' + acc.lamports);
      } else {
        results.push({ name: p.name, id: p.id, exists: false });
        console.log(p.name + ': ' + p.id + ' — NOT FOUND');
      }
    } catch(e) {
      results.push({ name: p.name, id: p.id, exists: false, error: e.message });
      console.log(p.name + ': ' + p.id + ' — ERROR: ' + e.message);
    }
  }
  
  const fs = require('fs');
  const path = require('path');
  const baseDir = '/home/jack/newtheo/workspace-cyberdyne/gold-miner';
  
  console.log('\n=== Checking deployed.json files ===');
  function findDeployed(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory() && item.name !== 'node_modules' && item.name !== 'target') {
        findDeployed(fullPath);
      } else if (item.name === 'deployed.json' || item.name.endsWith('.json') && item.name.includes('deploy')) {
        try {
          const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          console.log(fullPath.replace(baseDir, '') + ':');
          if (content.programId) console.log('  programId: ' + content.programId);
          if (content.program) console.log('  program: ' + content.program);
          if (content.mint) console.log('  mint: ' + content.mint);
          if (content.goldMint) console.log('  goldMint: ' + content.goldMint);
        } catch(e) {}
      }
    }
  }
  findDeployed(baseDir);
  
  // Derive PDAs
  const pdas = {};
  for (const p of knownPrograms) {
    try {
      const pk = new PublicKey(p.id);
      const [configV2] = PublicKey.findProgramAddressSync([Buffer.from('silver_config_v2')], pk);
      const [configV1] = PublicKey.findProgramAddressSync([Buffer.from('game_config')], pk);
      pdas[p.id] = { silver_config_v2: configV2.toBase58(), game_config: configV1.toBase58() };
    } catch(e) {}
  }
  
  const md = `# Gold Miner Program Audit — Generated ${new Date().toISOString()}

## On-Chain Program Status

| Name | Program ID | Exists | Executable | Owner | Data Size | Lamports |
|------|-----------|--------|------------|-------|-----------|----------|
${results.map(r => 
  '| ' + [r.name, r.id, r.exists ? '✅' : '❌', 
    r.exists ? (r.executable ? 'Yes' : 'No') : 'N/A',
    r.exists ? r.owner : 'N/A',
    r.exists ? r.dataSize : 'N/A',
    r.exists ? r.lamports : 'N/A'
  ].join(' | ') + ' |'
).join('\n')}

## Derived PDAs

| Program | Config (silver_config_v2) | Config (game_config) |
|---------|---------------------------|---------------------|
${Object.entries(pdas).map(([pid, p]) => '| ' + pid + ' | ' + p.silver_config_v2 + ' | ' + p.game_config + ' |').join('\n')}

## Methodology
1. Queried each known program ID via getAccountInfo RPC
2. Checked all deployed.json files in the gold-miner directory tree
3. Derived expected PDAs using program ID + seed bytes
`;
  fs.writeFileSync('/home/jack/newtheo/workspace-cyberdyne/gold-miner/docs/PROGRAM_AUDIT.md', md);
  console.log('\nWrote audit to: /home/jack/newtheo/workspace-cyberdyne/gold-miner/docs/PROGRAM_AUDIT.md');
}

main().catch(console.error);
