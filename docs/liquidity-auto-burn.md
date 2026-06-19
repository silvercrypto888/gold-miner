# Liquidity Auto-Burn Mechanism — Design Draft

> **Status:** Planning / Economic Design
> **Date:** 2026-06-19
> **Author:** Silver's brainstorm, Theo's notes
> **Token:** GOLD (on X1 Blockchain, SVM)
> **Pair:** GOLD / XNT on XDEX

---

## 1. The Core Loop

```
Miner mines a gold spot
        │
        ▼
┌─────────────────────────────┐
│  Miner:     +100 GOLD       │
│  Treasury:  +100 GOLD  (50%│
│             of total mint)  │
└──────────┬──────────────────┘
           │
           ▼
Treasury accumulates GOLD over time
           │
           ▼
Anyone calls `addLiquidityAndBurn()`
           │
           ▼
┌──────────────────────────────────────────────┐
│ 1. Sell fixed batch (e.g. 100 GOLD) → XNT    │
│    on XDEX                                    │
│ 2. Pair received XNT + matching GOLD value    │
│    as LP on XDEX                              │
│ 3. Burn the LP tokens (send to incinerator)   │
│ 4. Caller gets 0.1% reward (paid in GOLD)     │
└──────────────────────────────────────────────┘
```

## 2. Key Parameters (Initial Values)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Miner reward per mine | 100 GOLD | Existing base |
| Treasury mint per mine | 100 GOLD | 50% of total mint |
| Batch size per `addLiquidityAndBurn()` | 100 GOLD | Fixed, not % of treasury |
| GOLD sold per call | ~50 GOLD (half of batch) | Target ~50/50 LP ratio |
| Caller reward | 0.1% (0.1 GOLD per batch) | Covers gas + tiny profit |
| Minimum treasury to call | 200 GOLD | Enough for 2 batches |
| LP tokens | Burned to `11111111111111111111111111111111` (incinerator) | Permanent lock |

## 3. Why Fixed Batch (Not % of Treasury)

- **50% of treasury** would cause price shock proportional to accumulation — the longer since last call, the worse the impact
- **Fixed 100 GOLD batch** limits each call's market impact regardless of treasury size
- Any number of batches can be called consecutively, but each is independent
- As LP depth grows, 100 GOLD becomes a smaller % of depth → diminishing impact

## 4. Price Impact Simulation

**Assumptions:**
- Initial seed liquidity: 500 GOLD / 100 XNT (price = 0.2 XNT per GOLD)
- Batch: sell 50 GOLD for XNT, then pair 50 GOLD with resulting XNT

**Call #1 (LP depth = 500 GOLD / 100 XNT):**
- Sell 50 GOLD → ~9.1 XNT received (CPMM: k=50,000)
- Pair 50 GOLD + 9.1 XNT → new LP depth = 550 GOLD / 109.1 XNT
- LP tokens burned permanently
- Price impact of sell: ~1.8% slippage

**Call #10 (LP depth = ~950 GOLD / ~190 XNT):**
- Sell 50 GOLD → ~9.5 XNT received
- Pair 50 GOLD + 9.5 XNT → new LP depth = 1,000 GOLD / 200 XNT
- Price impact of sell: ~1% slippage

**Call #100 (LP depth = ~5,450 GOLD / ~1,090 XNT):**
- Sell 50 GOLD → ~9.9 XNT received
- Price impact of sell: ~0.2% slippage (effectively negligible)

> The system becomes **more efficient over time** as LP depth compounds.

## 5. Treasury Balance & LP/MC Over Time

Per mine: 100 GOLD to miner, 100 GOLD to treasury.

Per `addLiquidityAndBurn()`: 50 GOLD goes to LP, 50 GOLD sold for XNT.

**After 1,000 mines:**
- Total minted: 200,000 GOLD
- Miner supply: 100,000 GOLD
- Treasury processed: 100,000 GOLD (1,000 batches)
- LP locked: 50,000 GOLD + ~10,000 XNT
- Circulating supply: 150,000 GOLD
- LP/MC ratio: **~33%**

**After 10,000 mines:**
- Total minted: 2,000,000 GOLD
- Miner supply: 1,000,000 GOLD
- Treasury processed: 1,000,000 GOLD (10,000 batches)
- LP locked: 500,000 GOLD + ~100,000 XNT
- Circulating supply: 1,500,000 GOLD
- LP/MC ratio: **~33%** (steady state)

> LP/MC reaches a stable equilibrium at ~33% regardless of total mines.

## 6. Caller Incentive Economics

- Batch size: 100 GOLD
- Caller reward: 0.1 GOLD (0.1% of batch)
- At $0.01/GOLD → $0.001 per call
- At $0.10/GOLD → $0.01 per call
- X1 gas cost: ~0.0001 XN (~$0.00001 equivalent)

**Problem:** At low GOLD prices, 0.1% doesn't cover gas or justify a bot.

**Solution options:**
1. **Dynamic reward** — scale with price (e.g. minimum 0.01 XNT worth)
2. **XNT kickback** — take a tiny slice from the XNT side instead
3. **Don't worry about it** — the treasury accumulates, someone runs a bot when it's profitable, and in the meantime the treasury just holds GOLD (no harm)
4. **Protocol-funded caller** — the program itself can burn the LP and keep some XNT to fund callers later

I think **#3 is fine** for launch. As GOLD gains value, the incentive crosses the bot threshold organically.

## 7. Integration with Gold Miner Program

### New Instructions

```rust
// — Existing —
move_and_mine(direction)  // Mints 100 GOLD to miner + 100 GOLD to treasury

// — New —
add_liquidity_and_burn()  // Permissionless, anyone can call
```

### `move_and_mine` Changes
- Add `treasury_vault` as a writable account (ATA for GOLD held by program)
- After minting 100 GOLD to miner AND 100 GOLD to miner's ATA:
  - Actually no — mint 100 GOLD to miner, 100 GOLD to treasury vault
- The treasury vault is a PDA-controlled ATA that only the program can transfer from

### `add_liquidity_and_burn()` Accounts

```
1. treasury_vault           (writable) — program's GOLD ATA
2. program_xnt_vault        (writable) — program's XNT ATA (for LP pairing)
3. gold_mint                (writable) — GOLD token mint
4. xnt_mint                 (writable) — XNT token mint
5. xdex_amm_program         — XDEX AMM program ID
6. xdex_pool                (writable) — GOLD/XNT pool on XDEX
7. xdex_lp_mint             (writable) — LP token mint
8. incinerator              — burn address for LP tokens
9. caller                   (signer, writable) — gets 0.1% reward
10. token_program            — Token2022 or Token program
11. associated_token_program
12. system_program
```

### Flow

```
1. Program validates: treasury has ≥200 GOLD
2. Program approves XDEX swap: treasury_vault → sell 50 GOLD → XNT to program_xnt_vault
3. Program approves XDEX add_liquidity: 50 GOLD + received XNT → LP tokens minted
4. Program transfers LP tokens to incinerator
5. Program transfers 0.1 GOLD to caller as reward
```

## 8. Seed Liquidity Requirement

The treasury can't add LP if there's **no LP pool at all**. The `addLiquidityAndBurn()` requires an existing GOLD/XNT pool on XDEX.

**Seed approach:**
- Deployer creates the pool manually on XDEX with initial LP
- e.g. 500 GOLD + 100 XNT → sets initial price at 0.2 XNT/GOLD
- After that, every `addLiquidityAndBurn()` just adds to it

The seed liquidity is a **one-time cost** that bootstraps the entire auto-LP mechanism.

## 9. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Treasury sells into thin LP → high slippage | Medium | Fixed 100 GOLD batch; seed LP ensures minimum depth |
| Bot wars / MEV on `addLiquidityAndBurn()` | Low | Tiny reward means minimal incentive to frontrun |
| XDEX program upgrade breaks integration | Medium | Admin can pause `addLiquidityAndBurn()` and update pool address |
| GOLD price crashes to zero | Low | Treasury just holds GOLD; LP is already burned. No loss to protocol. |
| Caller never profitable → nobody calls | Low | Treasury just accumulates; no harm, bot arrives when price recovers |
| Too much supply to treasury → miners feel taxed | Medium | Communication: the treasury builds permanent LP that benefits everyone |

## 10. Open Questions for Discussion

1. **XDEX program ID?** — We need the actual AMM program address on X1 to build the CPI calls.
2. **XDEX LP token mint derivation?** — How XDEX derives LP mint / pool address from token pair.
3. **XDEX swap instruction format?** — Exact account layout for swap + add_liquidity CPIs.
4. **Incinerator address on X1?** — Standard burn address (`11111111111111111111111111111111`) works for SPL tokens.
5. **Do we start with 50% treasury or something lower?** — Currently spec'd at 50% but easy to tune.
6. **Should the caller reward be in GOLD or XNT?** — GOLD is simpler (program already has it), XNT avoids selling extra GOLD.
7. **Should there be a cooldown between calls?** — e.g. min 1 slot between `addLiquidityAndBurn()` to prevent spam.

## 11. Future Expansion (Gold Miner V2)

- **Dynamic treasury %** — could be adjusted by governance or based on LP depth
- **Multi-pool LP** — treasury could split across GOLD/XNT, GOLD/USDC, etc.
- **Auto-compound** — treasury could also collect XDEX trading fees and use them for more LP
- **Staking rewards** — some LP could be directed to stakers instead of burned (tradeoff: liquidity vs incentives)
