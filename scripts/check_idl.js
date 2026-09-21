const { PublicKey, Connection } = require("@solana/web3.js");
const crypto = require("crypto");
(async () => {
  const prog = new PublicKey("4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM");
  // Anchor IDL program (canonical)
  const idlProg = new PublicKey("C6x4n1kKX9QoWx3n9mH7yR6dA2B4F0Zx6uV2sE3cC8t");
  // IDL address = sha256(program_id ++ "anchor:idl"), as seed on IDL program
  const seedData = crypto.createHash("sha256")
    .update(prog.toBuffer()).update(Buffer.from("anchor:idl")).digest();
  let idlAddr=null,b=0;
  for (let bb=255;bb>=0;bb--){
    try { idlAddr=PublicKey.createProgramAddressSync([seedData,Buffer.from([bb])],idlProg); b=bb; break; }catch(e){}
  }
  console.log("Anchor IDL address (canonical derive):", idlAddr ? idlAddr.toBase58() : "none", "bump", b);
  // Try several RPCs
  const rpcs = ["https://rpc.testnet.x1.xyz","https://x1-testnet.xen.network"];
  for (const rpc of rpcs){
    try{
      const c = new Connection(rpc,"confirmed");
      let found=false;
      if(idlAddr){
        const a = await c.getAccountInfo(idlAddr);
        if(a){ console.log(rpc,"IDL ACCOUNT EXISTS, len",a.data.length,"owner",a.owner.toBase58()); found=true; }
      }
      if(!found) console.log(rpc,"no IDL account at derive");
    }catch(e){ console.log(rpc,"ERR",e.message); }
  }
})();
