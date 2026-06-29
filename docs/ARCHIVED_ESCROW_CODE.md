# Archived Escrow Code — Gold Miner (Early Experiment)

> **Status:** Removed from production on 2026-06-29.
> **Reason:** Escrow approach failed to make transactions (CPI/account validation issues).
> **Replaced with:** Session key model (wallet funds ephemeral session keypair, session key signs `move_and_mine`).
> **Preserved for:** Reference in future projects that need a player-escrow pattern.

---

## What This Was

An early attempt at an XNT escrow system where players would deposit native XNT into their Player PDA, and the program would deduct move fees from that escrow. The Rust instructions (`deposit_xnt`, `withdraw_xnt`) were never fully implemented or deployed — only the IDL and frontend hooks survived.

---

## 1. IDL Instructions (idl.ts)

```typescript
// DEPOSIT XNT — never implemented in Rust program
{
  name: "depositXnt",
  discriminator: [174, 84, 153, 146, 93, 0, 115, 244],
  accounts: [
    { name: "wallet", writable: true, signer: true },
    { name: "player", writable: true },
    { name: "systemProgram", address: "11111111111111111111111111111111" },
  ],
  args: [
    { name: "amountLamports", type: "u64" },
  ],
},

// WITHDRAW XNT — never implemented in Rust program
{
  name: "withdrawXnt",
  discriminator: [129, 188, 47, 92, 90, 169, 6, 251],
  accounts: [
    { name: "wallet", writable: true, signer: true },
    { name: "player", writable: true },
    { name: "systemProgram", address: "11111111111111111111111111111111" },
  ],
  args: [],
},
```

---

## 2. Frontend Hook (useGoldMiner.ts)

### State
```typescript
const [escrowBalance, setEscrowBalance] = useState<number>(0);
```

### Fetch Player Data (rent calculation — meaningless without escrow)
```typescript
const fetchPlayerData = useCallback(async () => {
  if (!publicKey || !programRef.current) return;
  try {
    const [playerPda] = getPlayerPda(publicKey, getProgramId());
    const account = await (programRef.current.account as any).player.fetch(playerPda);
    if (account) {
      setPlayerAccount(account as PlayerAccount);
      // This calculation was meaningless — Player PDA never held escrow
      const balance = await connectionRef.current!.getBalance(playerPda);
      const minRent = await connectionRef.current!.getMinimumBalanceForRentExemption(200);
      setEscrowBalance(Math.max(0, balance - minRent));
    }
  } catch {
    setPlayerAccount(null);
  }
}, [publicKey]);
```

### Deposit Handler
```typescript
const depositXnt = useCallback(async (amountXnt: number): Promise<TransactionResult> => {
  if (!publicKey || !signTransaction || !programRef.current)
    return { signature: "", success: false, error: "Wallet not connected" };
  setIsLoading(true); setError(null);
  try {
    const [playerPda] = getPlayerPda(publicKey, getProgramId());
    const amountLamports = new BN(amountXnt * LAMPORTS_PER_SOL);
    const tx = await programRef.current.methods
      .depositXnt(amountLamports)
      .accounts({ wallet: publicKey, player: playerPda, systemProgram: SystemProgram.programId })
      .transaction();
    tx.feePayer = publicKey;
    tx.recentBlockhash = (await connectionRef.current!.getLatestBlockhash()).blockhash;
    const signed = await signTransaction(tx);
    const signature = await connectionRef.current!.sendRawTransaction(signed.serialize());
    await connectionRef.current!.confirmTransaction(signature);
    await fetchPlayerData();
    return { signature, success: true };
  } catch (err: any) {
    const msg = err.message || "Deposit failed";
    setError("Error (see console)");
    return { signature: "", success: false, error: msg };
  } finally { setIsLoading(false); }
}, [publicKey, signTransaction, fetchPlayerData]);
```

### Withdraw Handler
```typescript
const withdrawXnt = useCallback(async (): Promise<TransactionResult> => {
  if (!publicKey || !signTransaction || !programRef.current)
    return { signature: "", success: false, error: "Wallet not connected" };
  setIsLoading(true); setError(null);
  try {
    const [playerPda] = getPlayerPda(publicKey, getProgramId());
    const tx = await programRef.current.methods
      .withdrawXnt()
      .accounts({ wallet: publicKey, player: playerPda, systemProgram: SystemProgram.programId })
      .transaction();
    tx.feePayer = publicKey;
    tx.recentBlockhash = (await connectionRef.current!.getLatestBlockhash()).blockhash;
    const signed = await signTransaction(tx);
    const signature = await connectionRef.current!.sendRawTransaction(signed.serialize());
    await connectionRef.current!.confirmTransaction(signature);
    await fetchPlayerData();
    return { signature, success: true };
  } catch (err: any) {
    const msg = err.message || "Withdrawal failed";
    setError("Error (see console)");
    return { signature: "", success: false, error: msg };
  } finally { setIsLoading(false); }
}, [publicKey, signTransaction, fetchPlayerData]);
```

### Return object
```typescript
return {
  playerAccount, gameConfig, escrowBalance, goldiumBalance,
  isLoading, error, depositXnt, withdrawXnt,
  fetchPlayerData, fetchGameConfig, fetchGoldiumBalance,
  refresh: fetchPlayerData,
};
```

---

## 3. TypeScript Types (types/index.ts)

```typescript
export interface PlayerState {
  wallet: PublicKey | null;
  sessionKey: PublicKey | null;
  position: Position;
  goldiumMinted: number;
  sessionExpiresAt: number;
  escrowBalance: number;  // REMOVED: never used by program
}
```

---

## 4. UI Component (DepositButtons.tsx)

Full component that rendered deposit buttons and a withdraw button. Used `escrowBalance`, `depositXnt`, `withdrawXnt` from `useGoldMiner`. Never imported into GameUI.tsx (orphaned component).

See git history or this archive for the full 95-line component.

Key props consumed:
- `escrowBalance` — displayed as "XNT Escrow" balance
- `depositXnt(amount)` — called on button click
- `withdrawXnt()` — called on "Withdraw All" click
- `isLoading`, `error` — UI state

---

## 5. Session Key Hook References (useSessionKey.ts)

`PlayerState` objects were constructed with `escrowBalance: 0` in two places:

```typescript
// In startSession success path:
setPlayerState(prev => prev ? { ...prev, sessionKey: spk, sessionExpiresAt: expirySlot } : {
  wallet: publicKey, sessionKey: spk, position: { x: 1, y: 1 },
  goldiumMinted: 0, sessionExpiresAt: expirySlot, escrowBalance: 0,
});

// In joinGame success path:
setPlayerState({
  wallet: publicKey, sessionKey: spk, position: { x: 1, y: 1 },
  goldiumMinted: 0, sessionExpiresAt: expirySlot, escrowBalance: 0,
});
```

Also in `refreshPlayerState`:
```typescript
const p = {
  wallet: new PublicKey(d.slice(8, 40)),
  sessionKey: new PublicKey(d.slice(40, 72)),
  position: { x: d.readUInt32LE(72), y: d.readUInt32LE(76) },
  goldiumMinted: Number(d.readBigUInt64LE(80)),
  sessionExpiresAt: Number(d.readBigUInt64LE(88)),
  escrowBalance: 0,
};
```

---

## Why It Failed

1. **Rust program never had the instructions.** The IDL defined `depositXnt`/`withdrawXnt` but `programs/gold-miner/src/lib.rs` only exports 8 instructions: `initialize_game`, `init_treasury`, `join_game`, `start_session`, `move_and_mine`, `reset_bitmap`, `update_gold_mint`, `treasury_auto_lp`.

2. **Player account has no `escrow` field.** The `Player` struct only has: `wallet`, `sessionKey`, `positionX`, `positionY`, `goldiumMinted`, `sessionExpiresAt`, `bump`.

3. **CPI complexity.** Adding `system_instruction::transfer` into/out of a PDA requires careful signer seed handling. The session key model sidesteps this entirely — the wallet directly funds the ephemeral session keypair.

4. **No economic need.** Gold Miner is free-to-play. Moves cost ~0.002 XNT in network fees, paid by the session key. No stake, no entry fee, no escrow required.

---

## If You Want to Revive This Pattern

To implement a proper escrow in a future project:

### Rust side:
```rust
#[account]
pub struct Player {
    pub wallet: Pubkey,
    pub session_key: Pubkey,
    pub position_x: u32,
    pub position_y: u32,
    pub goldium_minted: u64,
    pub session_expires_at: u64,
    pub escrow: u64,        // ← ADD THIS
    pub bump: u8,
}

pub fn deposit_xnt(ctx: Context<DepositXnt>, amount: u64) -> Result<()> {
    let player = &mut ctx.accounts.player;
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.wallet.to_account_info(),
            to: player.to_account_info(),
        },
    );
    system_program::transfer(cpi_ctx, amount)?;
    player.escrow += amount;
    Ok(())
}

pub fn withdraw_xnt(ctx: Context<WithdrawXnt>) -> Result<()> {
    let player = &mut ctx.accounts.player;
    let amount = player.escrow;
    require!(amount > 0, ErrorCode::NoFundsToWithdraw);
    let seeds = &[b"player", player.wallet.as_ref(), &[player.bump]];
    let signer = &[&seeds[..]];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: player.to_account_info(),
            to: ctx.accounts.wallet.to_account_info(),
        },
        signer,
    );
    system_program::transfer(cpi_ctx, amount)?;
    player.escrow = 0;
    Ok(())
}
```

### Frontend side:
Reuse the archived `DepositButtons.tsx` and `useGoldMiner.ts` deposit/withdraw handlers above. Just update the IDL to match the actual Rust instructions.

---

*Archived by Theo / xxen_bot on 2026-06-29.*
