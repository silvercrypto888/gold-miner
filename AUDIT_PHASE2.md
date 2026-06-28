# Gold Miner v2 — Phase 2 Security Audit
## Frontend (Next.js/TypeScript) + Session Keys

**Program:** `4GkZ3snMDedRn9BRvUtH1rx24AqzpDCZj7VP7WXGfZUr`  
**Scope:** `app/src/hooks/useSessionKey.ts`, `app/src/hooks/useGoldMiner.ts`, `app/src/hooks/useGame.ts`, `app/src/lib/idl.ts`, `app/src/lib/constants.ts`, `app/src/components/GameCanvas.tsx`, `app/src/components/WalletProvider.tsx`, `app/src/lib/utils.ts`  
**Auditor:** Theo / xxen_bot  
**Date:** 2026-06-27

---

## Summary

The frontend layer is well-architected for a browser game but carries **critical security gaps** in session key lifecycle management and a **HIGH-severity fragility** in instruction serialization. The optimistic UI reconciliation system is surprisingly robust, but RPC failure handling has blind spots that could trap users in broken states. Gas griefing is mitigated by hard caps but not fully prevented.

| Severity | Count | Categories |
|----------|-------|------------|
| CRITICAL | 2 | Session key security |
| HIGH | 3 | Instruction serialization, RPC failures, gas griefing |
| MEDIUM | 4 | Optimistic state, replay protection, UX edge cases |
| LOW | 2 | Cleanup races, error UX |
| INFO | 2 | Architecture notes |

---

## CRITICAL: Session Key Stored Unencrypted in localStorage

**Severity:** CRITICAL  
**File:** `app/src/lib/utils.ts:storeSessionKey()` / `loadSessionKey()`  
**Line:** 15-43

### Finding

The session keypair secret key is stored in `localStorage` as **base58-encoded plaintext JSON**:

```typescript
const data: SessionKeyData = {
  publicKey: bs58.encode(keypair.publicKey),
  secretKey: bs58.encode(keypair.secretKey),
  expiresAt,
};
localStorage.setItem(SESSION_KEY_STORAGE, JSON.stringify(data));
```

Any XSS payload, malicious browser extension, or script with access to the origin can read this and sign arbitrary `move_and_mine` transactions on behalf of the user until expiry (~4 hours).

### Why This Matters

- Session keys are **signers** for the hot-path `move_and_mine` instruction.
- A stolen session key can drain the player's escrow (withdraw requires wallet sig, but moves can grief).
- Browser extensions (including seemingly benign ones) routinely read all `localStorage`.
- The `clearSessionKey()` call only happens on explicit logout or expiry check — not on page unload, tab close, or wallet disconnect.

### Fix

**Option A (recommended):** Store session key in memory only. Accept that the user must re-authorize on full page reload. This is what most session-key implementations do.

**Option B:** Use the Web Crypto API to encrypt the secret key with a key derived from the wallet's signature of a static nonce. The user re-signs once per session to decrypt. This preserves persistence without plaintext exposure.

```typescript
// Pseudocode for Option B
const encryptionKey = await wallet.signMessage(Buffer.from("gold-miner-session-v1"));
const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, secretKey);
localStorage.setItem("session_key_encrypted", bufferToBase64(encrypted));
```

**Option C (minimum viable):** At minimum, add `window.addEventListener("beforeunload", clearSessionKey)` so keys don't persist across browser sessions.

---

## CRITICAL: Session Key Expiry Uses Client Clock, Not Chain Slot

**Severity:** CRITICAL  
**File:** `app/src/hooks/useSessionKey.ts`  
**File:** `app/src/lib/utils.ts:loadSessionKey()`  
**File:** `app/src/lib/constants.ts` (SESSION_DURATION_SLOTS)

### Finding

Session expiry is computed as:

```typescript
const expires = Date.now() + SESSION_DURATION_SLOTS * BLOCK_TIME_MS;
// 36000 slots * 400ms = ~4 hours wall-clock time
storeSessionKey(nkp, expires);
```

The Rust program computes expiry as:

```rust
p.session_expires_at = Clock::get()?.slot + SESSION_DURATION_SLOTS;
```

These are **two different time domains**. The frontend assumes 400ms/block time, but X1 testnet block times can drift. If the chain is slower than 400ms/slot, the frontend will think the session is valid while the program rejects it as expired. Conversely, if the chain is faster, the frontend may prematurely discard a still-valid session.

### Why This Matters

- User sees "Session Active" but every move TX fails with `SessionExpired` (error 0x1771).
- The auto-renewal logic in `useGame.ts` detects `"SessionExpired"` in the error string and attempts to call `startSession()`, which requires wallet signature — creating a jarring UX loop.
- An attacker who sets their system clock backward can extend perceived session lifetime arbitrarily.

### Fix

Query the chain slot on session creation and compute expiry from that:

```typescript
const slot = await connection.getSlot();
const expiresAtSlot = slot + SESSION_DURATION_SLOTS;
// Store both slot and wall-clock for UI display
```

Store `expiresAtSlot` in localStorage. On every `isSessionValid()` check, compare against `await connection.getSlot()`, not `Date.now()`.

---

## HIGH: Manual Instruction Serialization is Fragile and Duplicated

**Severity:** HIGH  
**File:** `app/src/hooks/useGame.ts:buildMoveTx()`  
**File:** `app/src/lib/idl.ts`  
**File:** `app/src/lib/constants.ts`

### Finding

The hot-path `move_and_mine` transaction is built manually with raw discriminators and account keys, bypassing Anchor's `.methods` builder:

```typescript
const data = Buffer.alloc(17);
MOVE_AND_MINE_DISC.copy(data, 0);  // [26, 202, 228, 63, 206, 4, 137, 63]
data[8] = dirByte;
// ...seq written at offset 9

const keys = [
  { pubkey: sessionPubkey!, isSigner: true, isWritable: false },
  { pubkey: playerPda, isSigner: false, isWritable: true },
  // ...11 accounts total
];

tx.add(new TransactionInstruction({ programId: getProgramId(), keys, data }));
```

This manual construction is **duplicated** — the IDL in `idl.ts` already defines the exact same structure. If the program is upgraded to add an account (e.g., a new fee destination), the frontend will silently build invalid transactions.

### Why This Matters

- The account ordering in `buildMoveTx()` must match the program's `MoveAndMine<'info>` **exactly**. Anchor's macro reorders accounts based on constraints. A constraint change (e.g., adding `rent_sysvar`) shifts indices silently.
- The discriminator bytes are hardcoded in two places: `idl.ts` and `constants.ts` (as `MOVE_AND_MINE_DISC`). They could drift.
- The memo/seq injection at offset 9 is non-standard — the program doesn't read it. This is dead data that bloats the TX.

### Fix

Use Anchor's `.methods` builder for ALL instructions, even the hot path:

```typescript
const tx = await program.methods
  .moveAndMine({ [direction.toLowerCase()]: {} })
  .accounts({
    sessionSigner: sessionPubkey,
    player: playerPda,
    // ...etc
  })
  .transaction();
```

If raw serialization is absolutely required for performance (unlikely — Anchor overhead is ~1-2ms), add a **compile-time check** that the manual keys match the IDL, and a **runtime assertion** on the first TX that the serialized instruction matches Anchor's output.

---

## HIGH: RPC Silent Drop Recovery Has 30s Timeout But No Retry

**Severity:** HIGH  
**File:** `app/src/hooks/useGame.ts`  
**Lines:** reconcilePending logic, pendingMoves batch confirm

### Finding

When `sendRawTransaction` succeeds but the transaction is silently dropped by the RPC (common on testnets with load), the frontend has a 30-second reconciliation timeout:

```typescript
if (!anyActive || (now - pendingSince > 30000)) {
  pendingMap.delete(key);
  changed = true;
}
```

After 30s, the pending mine is reverted in the UI — but **no retry is attempted**. The user's move is lost. They must manually re-press the key.

### Why This Matters

- X1 testnet RPCs (especially public endpoints) are known to drop TXs under load.
- A player who steps on gold, sees the TX "sent", then sees it revert 30s later has no signal to retry.
- The `pendingMinesRef` cleanup deletes the cell from tracking, so the user can step on it again — but this is invisible UX.

### Fix

Implement an **exponential backoff retry** for dropped TXs:

```typescript
// In reconcilePending, if >10s and not confirmed, resubmit with fresh blockhash
if (now - pendingSince > 10000 && !isCellMined(bits, x, y)) {
  await resubmitMoveTx(x, y); // re-sign with fresh blockhash
}
```

Also consider using `sendRawTransaction` with `preflightCommitment: 'processed'` and `skipPreflight: false` to catch errors earlier.

---

## HIGH: Blockhash Expiry Mid-Burst Not Fully Handled

**Severity:** HIGH  
**File:** `app/src/hooks/useGame.ts`  
**Lines:** preFetchBlockhash interval, buildMoveTx

### Finding

The frontend pre-fetches blockhashes every 400ms:

```typescript
const iv = setInterval(preFetchBlockhash, 400);
```

But there's a race: if a user holds down a movement key, the 100ms auto-move timer can fire 6 times in 600ms. The first move consumes the pre-fetched blockhash. Moves 2-6 fetch on-demand (`getLatestBlockhash`). If any of these land after the blockhash's `lastValidBlockHeight`, they will fail with `TransactionExpiredBlockheightExceededError`.

The error handler resets `nextBlockhashRef.current = null!`, but by then the TX is already dead.

### Why This Matters

- Burst moves (hold-to-repeat) are a core UX feature.
- Each failed TX costs a round-trip to RPC plus the user's patience.
- The 600ms `setTimeout` cooldown after successful send is client-side only — the blockhash may expire in ~90-150 slots on X1, which at 400ms/slot is ~36-60 seconds. The cooldown does NOT guarantee blockhash validity.

### Fix

1. **Per-TX blockhash freshness**: Don't reuse a blockhash for more than 1 TX. Fetch fresh for every move.
2. **Track blockhash age**: Store `lastValidBlockHeight` with each pending TX. Before sending a new TX, check if the previous blockhash is still valid.
3. **Use durable nonces** (overkill for a game, but worth noting).

---

## MEDIUM: Optimistic Position Update Can Desync from Chain

**Severity:** MEDIUM  
**File:** `app/src/hooks/useGame.ts:move()`  
**Line:** ~500

### Finding

The frontend updates position optimistically BEFORE the TX confirms:

```typescript
setPosition({ x: newX, y: newY }); // optimistic
// ...TX sent...
```

On error, it attempts to sync from chain:

```typescript
const info = await connRef.current.getAccountInfo(pda, "confirmed");
if (info) setPosition({ x: info.data.readUInt32LE(72), y: info.data.readUInt32LE(76) });
```

But the `syncPlayerPosition` function is throttled to once per 2 seconds, and the error handler's direct sync is **not** throttled. If two rapid moves fail in succession, the second sync may read chain state from before the first TX, snapping the player backward further than expected.

### Why This Matters

- Player sees themselves jump backward unexpectedly.
- If the player is in a "choke point" (narrow corridor), a desync could place them inside a wall or outside bounds in the local renderer.
- The `moveSeqRef` counter prevents stale confirmations from reverting newer moves, but it does NOT prevent stale `getAccountInfo` reads from doing the same.

### Fix

Add a sequence number to the Player account (or use the existing `session_expires_at` as a proxy). The frontend should reject any chain-synced position that has a lower implicit sequence than the last locally-known good position.

---

## MEDIUM: Replay Protection Relies on Memo, Which Program Ignores

**Severity:** MEDIUM  
**File:** `app/src/hooks/useGame.ts:buildMoveTx()`  
**Lines:** 430-440

### Finding

The frontend injects a 64-bit sequence into the instruction data to prevent duplicate signatures:

```typescript
const data = Buffer.alloc(17);
MOVE_AND_MINE_DISC.copy(data, 0);
data[8] = dirByte;
if (memo) {
  const seq = parseInt(memo.split("_")[0] || "0", 10);
  data.writeBigUInt64LE(BigInt(seq), 9);
}
```

But the Rust program's `move_and_mine` only reads 9 bytes (discriminator + direction enum):

```rust
// No reading of bytes 9-17 in the instruction handler
pub fn move_and_mine(ctx: Context<MoveAndMine>, direction: Direction) -> Result<()> {
```

The extra 8 bytes are **ignored by the program** and only serve to make the TX hash unique. This is actually fine for Solana's deduplication (different data = different signature), but it's misleading — the comment says "prevents duplicate signatures from rapid keypresses reusing the same blockhash," which is true at the RPC level, but there's no on-chain replay protection.

### Why This Matters

- If an RPC caches and replays a TX (e.g., during a network partition), the program would accept it because there's no nonce in the program state.
- An attacker with a stolen session key can replay any past `move_and_mine` TX from mempool history.

### Fix

Add a `move_nonce: u64` to the `Player` account. Increment it in `move_and_mine`. The frontend includes the expected nonce in the instruction data. Reject any TX with nonce <= current.

```rust
// In Player struct
pub move_nonce: u64,

// In move_and_mine
require!(move_nonce > player.move_nonce, GoldMinerError::ReplayAttack);
player.move_nonce = move_nonce;
```

---

## MEDIUM: Session Key Funding Race Condition

**Severity:** MEDIUM  
**File:** `app/src/hooks/useGame.ts`  
**Lines:** session balance check, fundSessionKey

### Finding

When session key balance is low (< 500,000 lamports):

```typescript
if (bal < 500_000) {
  // ...
  await fundSessionKey(sessionPubkey, fbh, flvb);
  sessionBalanceRef.current = { lamports: 1_000_000, time: now };
}
```

The `fundSessionKey` is called with a fresh blockhash, but the parent wallet must sign. If the user is in the middle of a rapid burst, the wallet popup interrupts gameplay. Worse, the `lastFundTimeRef` 5-second debounce means a second rapid move will see the stale balance and try to fund again.

### Why This Matters

- During hold-to-repeat movement, the fund popup can appear mid-burst, breaking UX.
- The `sessionBalanceRef` is optimistically set to 1,000,000 lamports before the funding TX confirms. If the funding TX fails (e.g., user rejects), the next move will think balance is sufficient and fail with insufficient funds.

### Fix

1. Pre-fund session keys to a higher amount (e.g., 0.5 XNT = 500M lamports) so top-ups are rare.
2. Separate "low balance warning" from "auto-funding." Let the user decide when to top up.
3. Don't optimistically set balance — wait for `confirmTransaction` on the fund TX.

---

## MEDIUM: Gas Griefing — Session Key Balance Can Be Drained by Spam

**Severity:** MEDIUM  
**File:** `app/src/hooks/useSessionKey.ts` / `useGame.ts`

### Finding

The session key pays for `move_and_mine` TX fees. With 0.2 XNT (~200M lamports) funding and ~5,000 lamports per TX, a player gets ~40,000 moves. An attacker who knows a player's session pubkey can:

1. **Not** drain the escrow (that's wallet-protected).
2. **But** spam empty `move_and_mine` TXs signed with a different key (doesn't matter — the fee is paid by the session key, not the signer).

Wait — actually, Solana fees are paid by the TX fee payer (`feePayer`), which is `sessionPubkey` in `buildMoveTx`. But the signer must be `sessionPubkey` for the program to accept it (the program checks `session_signer` against `player.session_key`).

So an attacker CANNOT grief with a wrong signer — the program rejects it. However:

- If the attacker steals the session key (see CRITICAL: localStorage), they can burn through the 0.2 XNT in seconds by spamming moves.
- The hard cap of `SESSION_MAX_LAMPORTS = 0.5` XNT limits damage to 0.5 XNT per session.

### Why This Matters

- 0.5 XNT is small, but if sessions are long-lived and keys leak, it's a griefing vector.
- The `sweepSessionKey` on session start/renew recovers leftover funds, but there's no `sweepSessionKey` on page unload or session expiry.

### Fix

1. Reduce `SESSION_MAX_LAMPORTS` to 0.1 XNT (enough for ~20,000 moves).
2. Add a `max_moves_per_session` counter to the Player account. After 10,000 moves, require wallet re-authorization.
3. Implement automatic `sweepSessionKey` on `beforeunload` and `visibilitychange` events.

---

## LOW: Sweep Logic Missing on Page Unload

**Severity:** LOW  
**File:** `app/src/hooks/useSessionKey.ts`

### Finding

`sweepSessionKey()` recovers leftover XNT from the session key back to the wallet. It's called on `startSession()` and `joinGame()`, but **NOT** on page unload, tab close, or component unmount.

### Fix

```typescript
useEffect(() => {
  const handler = () => { sweepSessionKey(); };
  window.addEventListener("beforeunload", handler);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sweepSessionKey();
  });
  return () => window.removeEventListener("beforeunload", handler);
}, [sweepSessionKey]);
```

Note: `beforeunload` handlers must be synchronous — async `sweepSessionKey` may not complete. Use `navigator.sendBeacon` or a synchronous fallback.

---

## LOW: Error Messages Leak to Console Only

**Severity:** LOW  
**File:** `app/src/hooks/useGoldMiner.ts`, `useSessionKey.ts`

### Finding

Most error handlers do:

```typescript
setError("Error (see console)");
```

This is terrible UX. Mobile users can't open console. The actual error (e.g., "User rejected the request") is lost.

### Fix

Surface sanitized error messages in the UI:

```typescript
const friendly = err?.message?.includes("User rejected") 
  ? "Transaction cancelled"
  : err?.message?.includes("Blockhash") 
  ? "Network timeout, retrying..."
  : "Something went wrong. Please try again.";
setError(friendly);
```

---

## INFO: IDL Type Mismatch — `PlayerAccount.sessionExpiresAt` is String

**Severity:** INFO  
**File:** `app/src/lib/idl.ts`

### Finding

```typescript
export interface PlayerAccount {
  wallet: string;
  sessionKey: string;
  positionX: number;
  positionY: number;
  goldiumMinted: string;      // ← u64 in Rust, string in TS
  sessionExpiresAt: string;   // ← u64 in Rust, string in TS
  bump: number;
}
```

Anchor returns BN for u64, not string. The actual runtime value from `program.account.player.fetch()` is a BN object. The type declaration is misleading but doesn't cause runtime errors because TS types are erased.

### Fix

Update types to match Anchor's output:

```typescript
import { BN } from "@coral-xyz/anchor";
export interface PlayerAccount {
  // ...
  goldiumMinted: BN;
  sessionExpiresAt: BN;
}
```

---

## INFO: Backpack Wallet Adapter is Hardcoded

**Severity:** INFO  
**File:** `app/src/components/WalletProvider.tsx`

### Finding

```typescript
const wallets = useMemo(() => [new BackpackWalletAdapter()], []);
```

Only Backpack is explicitly listed. Wallet-standard auto-discover may pick up others, but this is restrictive. Phantom, Solflare, and other X1-compatible wallets should be supported.

### Fix

Add standard adapters:

```typescript
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
const wallets = useMemo(() => [
  new BackpackWalletAdapter(),
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
], []);
```

---

## Appendix A: File-by-File Risk Heatmap

| File | Lines | Risk Areas | Overall |
|------|-------|-----------|---------|
| `useSessionKey.ts` | ~280 | Key lifecycle, storage, expiry | 🔴 HIGH |
| `useGame.ts` | ~670 | Manual IX, optimistic state, RPC | 🔴 HIGH |
| `utils.ts` | ~140 | localStorage plaintext | 🔴 CRITICAL |
| `idl.ts` | ~180 | Type mismatch, dual source of truth | 🟡 MEDIUM |
| `constants.ts` | ~200 | Hardcoded AMM addresses, env fallbacks | 🟡 MEDIUM |
| `GameCanvas.tsx` | ~580 | Foreground event interception | 🟢 LOW |
| `WalletProvider.tsx` | ~30 | Single-wallet support | 🟢 INFO |
| `useGoldMiner.ts` | ~160 | Deposit/withdraw (wallet-signed) | 🟢 LOW |

---

## Appendix B: Recommended Fix Priority

1. **Encrypt or remove session key from localStorage** (CRITICAL)
2. **Use chain slot for session expiry** (CRITICAL)
3. **Add move_nonce to Player account for replay protection** (HIGH)
4. **Use Anchor `.methods` builder or add compile-time checks** (HIGH)
5. **Implement TX retry for silent drops** (HIGH)
6. **Fix blockhash expiry in burst mode** (HIGH)
7. **Add beforeunload sweep** (LOW)
8. **Support multiple wallets** (INFO)
