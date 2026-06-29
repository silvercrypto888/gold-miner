# Gold Miner — Game Design Intent

> **Author:** Silver 🪙 (Xenblocks Miner)  
> **Date:** 2026-06-29  
> **Status:** Core design philosophy, not an audit finding

---

## 1. The Core Mechanic: Spatial Competition via Consumable Resources

Gold spots are **consumed on first mine**. Once a spot is mined, it rewards no further GOLD. This is intentional.

Unlike typical clicker or idle games where resources respawn instantly or are personal, Gold Miner treats gold as a **shared, finite, consumable spatial resource**.

### Why this matters
- No artificial leaderboards or multipliers are needed to create competition
- The competition emerges **endogenously** from the rules themselves
- Early participation is rewarded not by a bonus, but by **access to unmined territory**

---

## 2. The "Early Adopter" Advantage Is Endogenous

The early adopter advantage is **not** imposed through:
- ❌ Multipliers (e.g., "2x for first 100 players")
- ❌ Airdrops or pre-mines
- ❌ Time-limited bonuses
- ❌ Founder advantages

It emerges naturally because:
- Every player starts at `(1,1)`
- Gold spots are finite and consumable
- The first to reach an area mines it first
- Late arrivals find already-mined spots (silent, no penalty, just no reward)

This creates a **scattering incentive** — players diffuse across the map like particles in a medium, seeking unclaimed territory. Multiple players clustering in a small area is **unsustainable** because they compete for the same finite spots.

---

## 3. Foresight & Deterministic Worldgen Are Intentional

The `foresight` feature and deterministic world generation are **not** oversights or exploits. They are core to the competitive equilibrium.

### With perfect foresight, competition still exists:
- All players can see gold ahead of them
- But **execution speed** and **path optimization** determine who gets there first
- This is a **race**, not a **guess**

The game rewards:
1. **Knowledge** — knowing where gold is (foresight)
2. **Speed** — getting there before others
3. **Strategy** — choosing routes that minimize competition

---

## 4. Nash Equilibrium: Spatial Diffusion

The stable strategy is for players to **spread out** across the map. Clustering is a losing strategy because:
- Shared finite spots → lower per-player yield
- Travel time to unmined areas increases
- First-mover advantage in any given area belongs to whoever arrived first

This mirrors real-world resource competition (gold rushes, mining claims, oil exploration).

---

## 5. Why "Already Mined" Is Silent Success, Not Error

The program handles already-mined spots by logging and returning `Ok(())` rather than an error. This is intentional:

| Design choice | Rationale |
|---|---|
| Silent success | Walking over a mined spot should not penalize or confuse the player |
| No error thrown | The transaction is valid; the player simply found no gold there |
| `msg!()` log only | Useful for debugging, invisible to normal players |

If this were an error:
- Bots could grief players by mining spots ahead of them, causing their transactions to fail
- Frontend would need complex error-handling for a harmless condition
- The game would feel punitive rather than competitive

---

## 6. Gold Respawn: Permissionless Bitmap Reset

When 75% of gold spots are mined, anyone can call `reset_mineable_area()` to:
- Zero the bitmap
- Reset the counter
- Allow gold to respawn across the grid

This prevents the map from becoming permanently exhausted while preserving the competitive cycle.

---

## 7. Summary

| Feature | Intentional? | Purpose |
|---|---|---|
| Consumable gold spots | ✅ Yes | Creates spatial competition |
| Same starting point `(1,1)` | ✅ Yes | Equal opportunity, not equal outcome |
| Silent already-mined | ✅ Yes | No griefing, no punitive UX |
| Foresight / deterministic world | ✅ Yes | Race-based, not luck-based |
| Early adopter advantage | ✅ Yes | Endogenous from mechanics, not multipliers |
| Scatter/diffusion incentive | ✅ Yes | Encourages map exploration |
| Permissionless reset at 75% | ✅ Yes | Prevents permanent exhaustion |

---

## 8. For Auditors

If reviewing this code, please note:
- The "AlreadyMined" error was removed from the IDL (commit `201f65b`) because the program intentionally never returns it
- This is **not** a missing check — it is a **design choice**
- The game theory above explains why silent success is preferred over an error
