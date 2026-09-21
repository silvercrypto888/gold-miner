# Gold Miner v2 — Mainnet Deployment

One clean run, staged at `scripts/mainnet/`. Run **in order** — each step depends on the previous.

## Pre-requisites
- Mainnet deployer keypair funded at `secure/gold-miner-mainnet/deployer-mainnet.json` (funded: **1.00 XNT** ✅)
- Mainnet program keypair at `target/deploy/gold_miner_mainnet-keypair.json` → **`DZ4FErNjFdqFMumiYpTLtdKh5a1mqREhYFpQPr6XiJcP`**
- Toolchain: **v3.1.14** SBF. **ALWAYS** build with `RUSTUP_TOOLCHAIN=1.89.0-sbpf-solana-v1.52` (workspace rustup override → v1.53 is uninstalled; the env pin beats it).

## Sequence

| Step | Command | Result |
|------|---------|--------|
| 0 | `./scripts/mainnet/00-preflight.sh` | Verifies balance, SBF freshness, Anchor.toml↔keypair, backup |
| 1 | `./scripts/mainnet/01-deploy-program.sh` | Deploys `gold_miner.so` with new program ID |
| 2 | `node scripts/mainnet/02-create-gold-mint.js` | Creates mainnet **Token-2022 GOLD mint** + Metadata ext (extensions at creation — the one-way door) |
| 3 | `node scripts/mainnet/05-init-game.js` | `initialize_game` → `init_treasury` → `update_gold_mint` (points config at mainnet mint) |
| 4 | `node scripts/mainnet/06-set-mint-authority.js` | Transfers **mint authority → GameConfig PDA** (NO pre-mine — mints nothing) |
| 5 | `node scripts/mainnet/04-verify-config.js` | Reads on-chain GameConfig/Treasury/bitmap |

> **No pre-mine** (litepaper): the ONLY source of GOLD is gameplay mining. $06$ mints **zero** — it just hands mint authority to the GameConfig PDA so mining can mint on-demand.

## Post-deploy (needs Silver / later)
- **AMM pool fill** (§2.3): create mainnet GOLD/XNT pool → replace the placeholders in `lib.rs` (`MARKET_AUTHORITY`, `AMM_CONFIG`, `POOL_STATE`, vaults, observer, LP mint) with real addresses → rebuild → redeploy → `treasury_auto_lp` live.
- **Finalize / make immutable** (§2.6): only after Silver's explicit later green-light → `solana program set-upgrade-authority <PROG_ID> --final`.

## Secret hygiene (locked rule — never violated)
- No seed phrase / secret material is printed, logged, or sent to chat/GitHub. Ever.
- Deployer keys live in `secure/` (outside git, perms 600). Program keys in `secure-mainnet/` (gitignored, perms 600).
- Only public addresses are written to `gold-mint-mainnet-info.json` / this repo.
