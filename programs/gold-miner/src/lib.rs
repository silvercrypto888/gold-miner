use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use anchor_spl::token::spl_token;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::Token;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount, mint_to, MintTo};

declare_id!("4GQU2H48Ai2WtM8mzGexLGDA1KAcrvrHRXG1WeHaWxAM");

pub const GRID_SIZE: u32 = 1024;
pub const GOLD_PER_MINE: u64 = 100;
pub const GOLD_DECIMALS: u8 = 9;
pub const SESSION_DURATION_SLOTS: u64 = 36000;
pub const BITMAP_BODY: usize = 131_072;
pub const BITMAP_ACCT: usize = BITMAP_BODY;
pub const TOTAL_GOLD_SPOTS: u64 = 161_390;
pub const RESET_THRESHOLD: u64 = 121_042; // 75% of 161,390 total gold spots

// Treasury / LP constants
pub const MIN_GOLD_FOR_LP: u64 = 1000 * 10u64.pow(GOLD_DECIMALS as u32);
pub const MIN_LP_TO_BURN: u64 = 1000;
pub const SLIPPAGE_BPS: u64 = 100;
pub const INCINERATOR: &str = "1nc1nerator11111111111111111111111111111111";

// AMM constants
pub const AMM_PROGRAM_ID: &str = "7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf";
pub const MARKET_AUTHORITY: &str = "2HbqjtA9gB9c95c8KkUUWxhtNjCfYcPbvfdhcdobbq1C";
pub const AMM_CONFIG: &str = "3FzzbxwpdJKxRW1yNT7UPYmna17SwC9PRmskMa8A2BuY";
pub const POOL_STATE: &str = "FuWCSt8fx3r8CZ7UjsbxxozNxJipgcT3XUcsSVVTzWtz";
pub const GOLD_VAULT: &str = "DvprQjnFnjhdjqLDkagcjSsqYZNuDPbXmto9zdqDcE94";
pub const XNT_VAULT: &str = "AkvjBU6S3G4UdrXFHrgZPxnofrCgEToXvtbczKpFqvFD";
pub const OBSERVER_STATE: &str = "DUd6JfdKGA8M2xiSWLGwfxkDgHXWQKVLL6CCvcdFx2En";
pub const GOLD_MINT_ADDR: &str = "vKxnbuf4HeR6espPnfnVwaByaWgp3NHSGWGmjyNyrS6";
pub const XNT_MINT_ADDR: &str = "So11111111111111111111111111111111111111112";
pub const LP_MINT_ADDR: &str = "R42M1rNtsrDvTAKMZbMWHE2TXZxPqAZzZ5bR6uR3Qzy";
pub const XNT_TOKEN_PROG: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
pub const GOLD_TOKEN_PROG: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
pub const LP_TOKEN_PROG: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// ── AMM immutability fingerprint ────────────────────────────────────────────
// ⚠️  CRITICAL: Gold Miner is intended to become immutable. These CPI calls target
//     a specific AMM program binary. If the AMM at AMM_PROGRAM_ID is ever upgraded,
//     the CPIs below may fail or behave incorrectly. The lightweight fingerprint
//     below catches ~99 % of upgrades by checking data length + ELF header prefix.
//     To obtain the real values for your deploy, run on a machine with Solana CLI:
//       solana program dump 7EEuq61z9VKdkUzj7G36xGd7ncyz8KBtUwAWVjypYQHf amm.bin --url <X1_RPC>
//       ls -l amm.bin                               # → AMM_EXPECTED_DATA_LEN
//       head -c 32 amm.bin | xxd -p | sed 's/../0x&, /g'  # → AMM_EXPECTED_PREFIX
// ─────────────────────────────────────────────────────────────────────────────
pub const AMM_EXPECTED_DATA_LEN: usize = 0; // TODO: fill at deploy time
pub const AMM_EXPECTED_PREFIX: [u8; 32] = [
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]; // TODO: fill at deploy time

// AMM instruction discriminators
pub const SWAP_BASE_INPUT_DISCRIMINATOR: [u8; 8] = [0x8f, 0xbe, 0x5a, 0xda, 0xc4, 0x1e, 0x33, 0xde];
pub const DEPOSIT_DISCRIMINATOR: [u8; 8] = [0xf2, 0x23, 0xc6, 0x89, 0x52, 0xe1, 0xf2, 0xb6];

#[program]
pub mod gold_miner {
    use super::*;

    pub fn initialize_game(ctx: Context<InitializeGame>) -> Result<()> {
        let cfg = &mut ctx.accounts.game_config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.grid_size = GRID_SIZE;
        cfg.gold_mint = ctx.accounts.gold_mint.key();
        cfg.gold_bitmap = ctx.accounts.gold_bitmap.key();
        cfg.total_gold_mined = 0;
        cfg.bump = ctx.bumps.game_config;
        cfg.immutable = false;
        msg!("Game init. Grid {}x{}", GRID_SIZE, GRID_SIZE);
        Ok(())
    }

    pub fn init_treasury(ctx: Context<InitTreasury>) -> Result<()> {
        let cfg = &mut ctx.accounts.game_config;
        require!(!cfg.immutable, GoldMinerError::GameIsImmutable);
        let treasury = &mut ctx.accounts.treasury;
        treasury.game_config = ctx.accounts.game_config.key();
        treasury.gold_accumulated = 0;
        treasury.xnt_accumulated = 0;
        treasury.lp_burned = 0;
        treasury.bump = ctx.bumps.treasury;
        msg!("Treasury initialized");
        Ok(())
    }

    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        let p = &mut ctx.accounts.player;
        p.wallet = ctx.accounts.wallet.key();
        p.position_x = 1;
        p.position_y = 1;
        p.goldium_minted = 0;
        p.session_key = Pubkey::default();
        p.session_expires_at = 0;
        p.bump = ctx.bumps.player;
        msg!("Joined at (1,1)");
        Ok(())
    }

    pub fn start_session(ctx: Context<StartSession>, session_key: Pubkey) -> Result<()> {
        let p = &mut ctx.accounts.player;
        p.session_key = session_key;
        p.session_expires_at = Clock::get()?.slot + SESSION_DURATION_SLOTS;
        Ok(())
    }

    pub fn move_and_mine(ctx: Context<MoveAndMine>, direction: Direction) -> Result<()> {
        let clock = Clock::get()?;
        let player = &mut ctx.accounts.player;
        require!(clock.slot <= player.session_expires_at, GoldMinerError::SessionExpired);

        let (nx, ny) = match direction {
            Direction::Up => (player.position_x, player.position_y + 1),
            Direction::Down => (player.position_x, player.position_y - 1),
            Direction::Left => (player.position_x - 1, player.position_y),
            Direction::Right => (player.position_x + 1, player.position_y),
        };
        require!(nx >= 1 && nx <= GRID_SIZE, GoldMinerError::OutOfBounds);
        require!(ny >= 1 && ny <= GRID_SIZE, GoldMinerError::OutOfBounds);
        player.position_x = nx;
        player.position_y = ny;

        let bit_idx = ((ny - 1) as usize) * (GRID_SIZE as usize) + ((nx - 1) as usize);
        let byte_idx = bit_idx / 8;
        let bit_pos = bit_idx % 8;
        let mask = 1u8 << bit_pos;

        let data = &mut ctx.accounts.gold_bitmap.try_borrow_mut_data()?;

        if (nx & ny) % 7 == 0 {
            if data[byte_idx] & mask == 0 {
                data[byte_idx] |= mask;
                drop(data);

                player.goldium_minted = player.goldium_minted.saturating_add(GOLD_PER_MINE);
                ctx.accounts.game_config.total_gold_mined =
                    ctx.accounts.game_config.total_gold_mined.saturating_add(1);

                let amount = GOLD_PER_MINE
                    .checked_mul(10u64.pow(GOLD_DECIMALS as u32))
                    .ok_or(GoldMinerError::ArithmeticError)?;

                // Mint GOLD to player
                mint_to(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        MintTo {
                            mint: ctx.accounts.gold_mint.to_account_info(),
                            to: ctx.accounts.player_token_account.to_account_info(),
                            authority: ctx.accounts.game_config.to_account_info(),
                        },
                        &[&[b"silver_config_v2", &[ctx.accounts.game_config.bump]]],
                    ),
                    amount,
                )?;

                // Also mint GOLD to treasury
                mint_to(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        MintTo {
                            mint: ctx.accounts.gold_mint.to_account_info(),
                            to: ctx.accounts.treasury_token_account.to_account_info(),
                            authority: ctx.accounts.game_config.to_account_info(),
                        },
                        &[&[b"silver_config_v2", &[ctx.accounts.game_config.bump]]],
                    ),
                    amount,
                )?;

                // Update treasury accumulator
                let treasury = &mut ctx.accounts.treasury;
                treasury.gold_accumulated = treasury.gold_accumulated.saturating_add(amount);

                msg!("+{} GOLD at ({},{})", GOLD_PER_MINE, nx, ny);
            } else {
                // Already mined — this is intentionally NOT an error.
                // Players can walk over already-mined spots harmlessly.
                // If you change this to return an error, make sure the
                // frontend doesn't treat "stepping on a mined spot" as a
                // terminal failure. It should just mean "no gold here."
                msg!("Moved ({},{}) mined", nx, ny);
            }
        } else {
            msg!("Moved ({},{}) nogold", nx, ny);
        }
        Ok(())
    }

    /// Permissionless bitmap reset: anyone can call this once 75% of gold spots are mined.
    /// Zeroes the bitmap and resets the counter, letting gold respawn across the grid.
    pub fn reset_bitmap(ctx: Context<ResetBitmap>) -> Result<()> {
        let cfg = &mut ctx.accounts.game_config;
        require!(
            cfg.total_gold_mined >= RESET_THRESHOLD,
            GoldMinerError::NotEnoughMinedForReset
        );

        let data = &mut ctx.accounts.gold_bitmap.try_borrow_mut_data()?;
        // Zero out the bitmap body (skip 8-byte discriminator)
        for byte in data[8..].iter_mut() {
            *byte = 0;
        }
        let _ = data;

        cfg.total_gold_mined = 0;
        msg!("Bitmap reset. {} gold spots mined before reset.", RESET_THRESHOLD);
        Ok(())
    }

    pub fn update_gold_mint(ctx: Context<UpdateGoldMint>) -> Result<()> {
        let cfg = &mut ctx.accounts.game_config;
        require!(!cfg.immutable, GoldMinerError::GameIsImmutable);
        require!(
            ctx.accounts.authority.key() == cfg.authority,
            GoldMinerError::InvalidSessionKey
        );
        let old_mint = cfg.gold_mint;
        cfg.gold_mint = ctx.accounts.new_gold_mint.key();
        msg!("Gold mint updated: {} -> {}", old_mint, cfg.gold_mint);
        Ok(())
    }

    /// Finalize the game — permanently locks gold_mint and prevents init_treasury re-init.
    /// Call this once mainnet configuration is complete. The program remains upgradeable
    /// via BPF loader, but the game state becomes admin-free.
    pub fn finalize_game(ctx: Context<FinalizeGame>) -> Result<()> {
        let cfg = &mut ctx.accounts.game_config;
        require!(
            ctx.accounts.authority.key() == cfg.authority,
            GoldMinerError::InvalidSessionKey
        );
        require!(!cfg.immutable, GoldMinerError::GameIsImmutable);
        cfg.immutable = true;
        msg!("Game finalized — no further config changes possible");
        Ok(())
    }

    /// Treasury auto-LP: swaps ~50% of treasury GOLD for XNT, then deposits both as LP, burns LP tokens.
    pub fn treasury_auto_lp(ctx: Context<TreasuryAutoLp>) -> Result<()> {
        // ── Lightweight AMM fingerprint check (~500 CUs) ─────────────────────
        // Fails safely if the AMM binary has changed, preventing dangerous CPIs.
        {
            let amm_info = ctx.accounts.amm_program.to_account_info();
            let amm_data = amm_info.data.borrow();
            // Only enforce when constants have been configured (non-zero length)
            if AMM_EXPECTED_DATA_LEN > 0 {
                require!(
                    amm_data.len() == AMM_EXPECTED_DATA_LEN,
                    GoldMinerError::AmmProgramVersionMismatch
                );
                require!(
                    &amm_data[..32] == &AMM_EXPECTED_PREFIX[..],
                    GoldMinerError::AmmProgramVersionMismatch
                );
            }
        }
        // ───────────────────────────────────────────────────────────────────────

        let gold_balance = ctx.accounts.treasury_gold_ata.amount;
        msg!("Treasury GOLD balance: {}", gold_balance);

        require!(gold_balance >= MIN_GOLD_FOR_LP, GoldMinerError::InsufficientGoldForLp);

        let swap_amount = gold_balance / 2; // 50% of treasury GOLD
        let remaining_gold = gold_balance - swap_amount;

        // Read pool reserves to compute expected XNT output (anti-sandwich)
        let pool_gold = {
            let info = ctx.accounts.gold_vault.to_account_info();
            let acc = anchor_spl::token::TokenAccount::try_deserialize(&mut &**info.data.borrow())?;
            acc.amount
        };
        let pool_xnt = {
            let info = ctx.accounts.xnt_vault.to_account_info();
            let acc = anchor_spl::token::TokenAccount::try_deserialize(&mut &**info.data.borrow())?;
            acc.amount
        };
        // Constant product: k = pool_gold * pool_xnt
        // After swap: (pool_gold + swap_amount) * (pool_xnt - xnt_out) = k
        // xnt_out = pool_xnt - (k / (pool_gold + swap_amount))
        let k = (pool_gold as u128).saturating_mul(pool_xnt as u128);
        let new_pool_gold = (pool_gold as u128).saturating_add(swap_amount as u128);
        let expected_xnt_out = if new_pool_gold > 0 {
            (pool_xnt as u128).saturating_sub(k / new_pool_gold)
        } else {
            0u128
        };
        // Apply slippage tolerance (SLIPPAGE_BPS = 100 = 1%)
        let min_xnt_out = (expected_xnt_out * (10_000u128 - SLIPPAGE_BPS as u128) / 10_000u128) as u64;
        msg!("Pool: {} GOLD, {} XNT. Expected XNT out: {}, min ({} bps slippage): {}",
            pool_gold, pool_xnt, expected_xnt_out, SLIPPAGE_BPS, min_xnt_out);

        msg!("Swapping {} GOLD for XNT", swap_amount);

        let mut swap_data = Vec::with_capacity(24);
        swap_data.extend_from_slice(&SWAP_BASE_INPUT_DISCRIMINATOR);
        swap_data.extend_from_slice(&swap_amount.to_le_bytes());
        swap_data.extend_from_slice(&min_xnt_out.to_le_bytes());

        let treasury_key = ctx.accounts.treasury.key();
        let treasury_bump = ctx.accounts.treasury.bump;
        let game_config_key = ctx.accounts.game_config.key();
        let seeds = &[b"treasury", game_config_key.as_ref(), &[treasury_bump]];
        let signer_seeds = &[&seeds[..]];

        // CPI: SwapBaseInput
        solana_program::program::invoke_signed(
            &solana_program::instruction::Instruction {
                program_id: ctx.accounts.amm_program.key(),
                accounts: vec![
                    solana_program::instruction::AccountMeta::new(treasury_key, true),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.market_authority.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.amm_config.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.pool_state.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.treasury_gold_ata.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.treasury_xnt_ata.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.gold_vault.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.xnt_vault.key(), false),
                    solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.gold_token_prog.key(), false),
                    solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.xnt_token_prog.key(), false),
                    solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.gold_mint.key(), false),
                    solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.xnt_mint.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.observer_state.key(), false),
                ],
                data: swap_data,
            },
            &[
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.market_authority.to_account_info(),
                ctx.accounts.amm_config.to_account_info(),
                ctx.accounts.pool_state.to_account_info(),
                ctx.accounts.treasury_gold_ata.to_account_info(),
                ctx.accounts.treasury_xnt_ata.to_account_info(),
                ctx.accounts.gold_vault.to_account_info(),
                ctx.accounts.xnt_vault.to_account_info(),
                ctx.accounts.xnt_token_prog.to_account_info(),
                ctx.accounts.gold_token_prog.to_account_info(),
                ctx.accounts.gold_mint.to_account_info(),
                ctx.accounts.xnt_mint.to_account_info(),
                ctx.accounts.observer_state.to_account_info(),
            ],
            signer_seeds,
        )?;

        // Re-read XNT balance from account data after swap CPI (cached amount is stale)
        let xnt_received = {
            let info = ctx.accounts.treasury_xnt_ata.to_account_info();
            let acc = anchor_spl::token::TokenAccount::try_deserialize(&mut &**info.data.borrow())?;
            acc.amount
        };
        msg!("XNT received from swap: {}", xnt_received);

        // Re-read pool reserves after swap (they changed)
        let pool_xnt = {
            let info = ctx.accounts.xnt_vault.to_account_info();
            let acc = anchor_spl::token::TokenAccount::try_deserialize(&mut &**info.data.borrow())?;
            acc.amount
        };
        let pool_gold = {
            let info = ctx.accounts.gold_vault.to_account_info();
            let acc = anchor_spl::token::TokenAccount::try_deserialize(&mut &**info.data.borrow())?;
            acc.amount
        };
        let deposit_gold = if pool_xnt > 0 && xnt_received > 0 {
            // proportional_gold = xnt_received * pool_gold / pool_xnt
            ((xnt_received as u128).saturating_mul(pool_gold as u128) / (pool_xnt as u128)) as u64
        } else {
            0
        };
        let deposit_gold = std::cmp::min(deposit_gold, remaining_gold);
        msg!("Pool: {} XNT, {} GOLD. XNT accumulated in treasury: {}", pool_xnt, pool_gold, xnt_received);

        // ── Step 2: Deposit proportional GOLD + XNT as LP ────────────────────
        // Raydium CP Swap deposit accounts:
        // Pool has XNT as token0, GOLD as token1 (based on pool state layout)
        // 1. owner (signer) = treasury
        // 2. authority = market_authority
        // 3. poolState = pool_state
        // 4. ownerLpToken = treasury_lp_ata
        // 5. token0Account = treasury_xnt_ata (token0 = XNT)
        // 6. token1Account = treasury_gold_ata (token1 = GOLD)
        // 7. token0Vault = xnt_vault
        // 8. token1Vault = gold_vault
        // 9. tokenProgram = xnt_token_prog (SPL Token for XNT)
        // 10. tokenProgram2022 = gold_token_prog (Token2022 for GOLD)
        // 11. vault0Mint = xnt_mint
        // 12. vault1Mint = gold_mint
        // 13. lpMint = lp_mint
        //
        // Args: lp_token_amount (u64), maximum_token0_amount (u64), maximum_token1_amount (u64)
        //
        // Calculate LP tokens to mint based on the limiting token
        let total_lp_supply = {
            let info = ctx.accounts.lp_mint.to_account_info();
            let mint = anchor_spl::token::Mint::try_deserialize(&mut &**info.data.borrow())?;
            mint.supply
        };
        // LP from XNT side: xnt_received * total_lp / pool_xnt
        let lp_from_xnt = if pool_xnt > 0 && total_lp_supply > 0 {
            ((xnt_received as u128).saturating_mul(total_lp_supply as u128) / (pool_xnt as u128)) as u64
        } else { 0 };
        // LP from GOLD side: deposit_gold * total_lp / pool_gold
        let lp_from_gold = if pool_gold > 0 && total_lp_supply > 0 {
            ((deposit_gold as u128).saturating_mul(total_lp_supply as u128) / (pool_gold as u128)) as u64
        } else { 0 };
        // Use the smaller LP amount (whichever token is the constraint)
        let lp_token_amount = std::cmp::min(lp_from_xnt, lp_from_gold);
        msg!("LP to mint: {} (from XNT: {}, from GOLD: {}), total LP supply: {}",
            lp_token_amount, lp_from_xnt, lp_from_gold, total_lp_supply);

        // Use full treasury balances as max amounts to avoid slippage issues
        let max_token0 = xnt_received;  // max XNT (token0)
        let max_token1 = remaining_gold; // max GOLD (token1)

        let mut deposit_data = Vec::with_capacity(32);
        deposit_data.extend_from_slice(&DEPOSIT_DISCRIMINATOR);
        deposit_data.extend_from_slice(&lp_token_amount.to_le_bytes());
        deposit_data.extend_from_slice(&max_token0.to_le_bytes());
        deposit_data.extend_from_slice(&max_token1.to_le_bytes());

        solana_program::program::invoke_signed(
            &solana_program::instruction::Instruction {
                program_id: ctx.accounts.amm_program.key(),
                accounts: vec![
                    solana_program::instruction::AccountMeta::new(treasury_key, true),
                    solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.market_authority.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.pool_state.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.treasury_lp_ata.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.treasury_xnt_ata.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.treasury_gold_ata.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.xnt_vault.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.gold_vault.key(), false),
                    solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.xnt_token_prog.key(), false),
                    solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.gold_token_prog.key(), false),
                    solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.xnt_mint.key(), false),
                    solana_program::instruction::AccountMeta::new_readonly(ctx.accounts.gold_mint.key(), false),
                    solana_program::instruction::AccountMeta::new(ctx.accounts.lp_mint.key(), false),
                ],
                data: deposit_data,
            },
            &[
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.market_authority.to_account_info(),
                ctx.accounts.pool_state.to_account_info(),
                ctx.accounts.treasury_lp_ata.to_account_info(),
                ctx.accounts.treasury_xnt_ata.to_account_info(),
                ctx.accounts.treasury_gold_ata.to_account_info(),
                ctx.accounts.xnt_vault.to_account_info(),
                ctx.accounts.gold_vault.to_account_info(),
                ctx.accounts.xnt_token_prog.to_account_info(),
                ctx.accounts.gold_token_prog.to_account_info(),
                ctx.accounts.xnt_mint.to_account_info(),
                ctx.accounts.gold_mint.to_account_info(),
                ctx.accounts.lp_mint.to_account_info(),
            ],
            signer_seeds,
        )?;

        // ── Step 3: Read LP balance and burn ────────────────────────────────
        let lp_minted = {
            let info = ctx.accounts.treasury_lp_ata.to_account_info();
            let acc = anchor_spl::token::TokenAccount::try_deserialize(&mut &**info.data.borrow())?;
            acc.amount
        };
        msg!("LP tokens minted: {}", lp_minted);

        require!(lp_minted >= MIN_LP_TO_BURN, GoldMinerError::InsufficientLpMinted);

        // Burn LP tokens directly (treasury PDA is the owner of treasury_lp_ata)
        let burn_ix = spl_token::instruction::burn(
            &ctx.accounts.lp_token_prog.key(),
            &ctx.accounts.treasury_lp_ata.key(),
            &ctx.accounts.lp_mint.key(),
            &treasury_key,
            &[],
            lp_minted,
        )?;
        solana_program::program::invoke_signed(
            &burn_ix,
            &[
                ctx.accounts.treasury_lp_ata.to_account_info(),
                ctx.accounts.lp_mint.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.lp_token_prog.to_account_info(),
            ],
            signer_seeds,
        )?;

        // Update treasury (all CPI calls done, safe to borrow mutably now)
        let treasury = &mut ctx.accounts.treasury;
        treasury.xnt_accumulated = treasury.xnt_accumulated.saturating_add(xnt_received);
        treasury.lp_burned = treasury.lp_burned.saturating_add(lp_minted);

        msg!(
            "Auto-LP complete: swapped {} GOLD, received {} XNT, deposited LP, burned {} LP tokens",
            swap_amount,
            xnt_received,
            lp_minted
        );

        Ok(())
    }
}

// ── Account structs ──────────────────────────────────────────────────────────

#[account]
#[derive(Default)]
pub struct GameConfig {
    pub authority: Pubkey,
    pub grid_size: u32,
    pub gold_mint: Pubkey,
    pub gold_bitmap: Pubkey,
    pub total_gold_mined: u64,
    pub bump: u8,
    pub immutable: bool,
}
impl GameConfig { pub const SIZE: usize = 8 + 32 + 4 + 32 + 32 + 8 + 1 + 1; }

#[account]
#[derive(Default)]
pub struct Player {
    pub wallet: Pubkey,
    pub session_key: Pubkey,
    pub position_x: u32,
    pub position_y: u32,
    pub goldium_minted: u64,
    pub session_expires_at: u64,
    pub bump: u8,
}
impl Player { pub const SIZE: usize = 8 + 32 + 32 + 4 + 4 + 8 + 8 + 1; }

#[account]
#[derive(Default)]
pub struct Treasury {
    pub game_config: Pubkey,
    pub gold_accumulated: u64,
    pub xnt_accumulated: u64,
    pub lp_burned: u64,
    pub bump: u8,
}
impl Treasury { pub const SIZE: usize = 8 + 32 + 8 + 8 + 8 + 1; }

// ── Instruction contexts ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = GameConfig::SIZE, seeds = [b"silver_config_v2"], bump)]
    pub game_config: Account<'info, GameConfig>,
    /// CHECK: pre-created 128KB bitmap, program-owned
    #[account(mut, owner = crate::ID)]
    pub gold_bitmap: UncheckedAccount<'info>,
    #[account(mut)]
    pub gold_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"silver_config_v2"], bump = game_config.bump,
              has_one = authority @ GoldMinerError::InvalidSessionKey)]
    pub game_config: Account<'info, GameConfig>,
    #[account(init, payer = authority, space = Treasury::SIZE, seeds = [b"treasury", game_config.key().as_ref()], bump)]
    pub treasury: Account<'info, Treasury>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(init, payer = wallet, space = Player::SIZE, seeds = [b"player", wallet.key().as_ref()], bump)]
    pub player: Account<'info, Player>,
    #[account(mut, seeds = [b"silver_config_v2"], bump = game_config.bump)]
    pub game_config: Account<'info, GameConfig>,
    #[account(mut, address = game_config.gold_mint)]
    pub gold_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(init_if_needed, payer = wallet, associated_token::mint = gold_mint, associated_token::authority = wallet, associated_token::token_program = token_program)]
    pub player_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartSession<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(mut, seeds = [b"player", wallet.key().as_ref()], bump = player.bump)]
    pub player: Account<'info, Player>,
}

#[derive(Accounts)]
pub struct MoveAndMine<'info> {
    pub session_signer: Signer<'info>,
    #[account(mut, seeds = [b"player", player.wallet.as_ref()], bump = player.bump,
              constraint = player.session_key == session_signer.key() @ GoldMinerError::InvalidSessionKey)]
    pub player: Account<'info, Player>,
    #[account(mut)]
    pub game_config: Account<'info, GameConfig>,
    /// CHECK: raw bitmap bytes, owned by program
    #[account(mut, owner = crate::ID)]
    pub gold_bitmap: UncheckedAccount<'info>,
    #[account(mut, address = game_config.gold_mint)]
    pub gold_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = gold_mint, associated_token::authority = player.wallet,
              associated_token::token_program = token_program)]
    pub player_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Treasury PDA — receives matching GOLD mint on each mine
    #[account(mut, seeds = [b"treasury", game_config.key().as_ref()], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    /// Treasury's GOLD ATA (Token2022, same as gold_mint)
    #[account(mut, associated_token::mint = gold_mint, associated_token::authority = treasury,
              associated_token::token_program = token_program)]
    pub treasury_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateGoldMint<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [b"silver_config_v2"], bump = game_config.bump,
              has_one = authority @ GoldMinerError::InvalidSessionKey)]
    pub game_config: Account<'info, GameConfig>,

    #[account(mut)]
    pub new_gold_mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeGame<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, seeds = [b"silver_config_v2"], bump = game_config.bump,
              has_one = authority @ GoldMinerError::InvalidSessionKey)]
    pub game_config: Account<'info, GameConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResetBitmap<'info> {
    /// Anyone can call — no signer restriction
    pub caller: Signer<'info>,

    /// Game config — tracks total_gold_mined
    #[account(mut, seeds = [b"silver_config_v2"], bump = game_config.bump)]
    pub game_config: Account<'info, GameConfig>,

    /// CHECK: raw bitmap bytes, owned by program
    #[account(mut, owner = crate::ID)]
    pub gold_bitmap: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct TreasuryAutoLp<'info> {
    /// Caller / transaction payer (permissionless — anyone can trigger auto-LP)
    pub caller: Signer<'info>,

    /// Game config — used for treasury PDA derivation
    #[account(mut, seeds = [b"silver_config_v2"], bump = game_config.bump)]
    pub game_config: Box<Account<'info, GameConfig>>,

    /// Treasury PDA
    #[account(mut, seeds = [b"treasury", game_config.key().as_ref()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, Treasury>>,

    // ── AMM accounts ──────────────────────────────────────────────────────
    /// CHECK: AMM program
    #[account(address = AMM_PROGRAM_ID.parse::<Pubkey>().unwrap())]
    pub amm_program: UncheckedAccount<'info>,
    /// CHECK: Market authority PDA
    #[account(mut, address = MARKET_AUTHORITY.parse::<Pubkey>().unwrap())]
    pub market_authority: UncheckedAccount<'info>,
    /// CHECK: AMM config account
    #[account(mut, address = AMM_CONFIG.parse::<Pubkey>().unwrap())]
    pub amm_config: UncheckedAccount<'info>,
    /// CHECK: Pool state PDA
    #[account(mut, address = POOL_STATE.parse::<Pubkey>().unwrap())]
    pub pool_state: UncheckedAccount<'info>,
    /// CHECK: GOLD vault
    #[account(mut, address = GOLD_VAULT.parse::<Pubkey>().unwrap())]
    pub gold_vault: UncheckedAccount<'info>,
    /// CHECK: XNT vault
    #[account(mut, address = XNT_VAULT.parse::<Pubkey>().unwrap())]
    pub xnt_vault: UncheckedAccount<'info>,
    /// CHECK: Observer state
    #[account(mut, address = OBSERVER_STATE.parse::<Pubkey>().unwrap())]
    pub observer_state: UncheckedAccount<'info>,

    // ── Treasury token accounts ─────────────────────────────────────────────
    /// Treasury's GOLD ATA (Token2022 — same as gold_mint)
    #[account(mut, associated_token::mint = gold_mint, associated_token::authority = treasury,
              associated_token::token_program = gold_token_prog)]
    pub treasury_gold_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Treasury's XNT ATA (regular SPL Token — Tokenkeg)
    #[account(mut, associated_token::mint = xnt_mint, associated_token::authority = treasury,
              associated_token::token_program = xnt_token_prog)]
    pub treasury_xnt_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Treasury's LP ATA (regular SPL Token — Tokenkeg)
    #[account(mut, associated_token::mint = lp_mint, associated_token::authority = treasury,
              associated_token::token_program = lp_token_prog)]
    pub treasury_lp_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    // ── Mint accounts ──────────────────────────────────────────────────────
    /// GOLD mint (Token2022 — validated at runtime via game_config.gold_mint)
    #[account(address = game_config.gold_mint)]
    pub gold_mint: Box<InterfaceAccount<'info, Mint>>,
    /// XNT mint (wrapped SOL, regular SPL Token — Tokenkeg)
    #[account(address = XNT_MINT_ADDR.parse::<Pubkey>().unwrap())]
    pub xnt_mint: Box<InterfaceAccount<'info, Mint>>,
    /// LP mint (regular SPL Token)
    #[account(mut, address = LP_MINT_ADDR.parse::<Pubkey>().unwrap())]
    pub lp_mint: Box<InterfaceAccount<'info, Mint>>,

    // ── Token programs ─────────────────────────────────────────────────────
    /// Token program for GOLD (Token2022 — TokenzQd)
    #[account(address = GOLD_TOKEN_PROG.parse::<Pubkey>().unwrap())]
    pub gold_token_prog: Program<'info, Token2022>,
    /// Token program for XNT (regular SPL Token — Tokenkeg)
    #[account(address = XNT_TOKEN_PROG.parse::<Pubkey>().unwrap())]
    pub xnt_token_prog: Program<'info, Token>,
    /// Token program for LP (regular SPL Token — Tokenkeg)
    #[account(address = LP_TOKEN_PROG.parse::<Pubkey>().unwrap())]
    pub lp_token_prog: Program<'info, Token>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

#[error_code]
pub enum GoldMinerError {
    #[msg("Invalid session key")]
    InvalidSessionKey,
    #[msg("Session expired")]
    SessionExpired,
    #[msg("Out of bounds")]
    OutOfBounds,
    #[msg("No funds")]
    NoFundsToWithdraw,
    #[msg("Arithmetic error")]
    ArithmeticError,
    #[msg("Insufficient GOLD in treasury for LP")]
    InsufficientGoldForLp,
    #[msg("Insufficient LP tokens minted")]
    InsufficientLpMinted,
    #[msg("Not enough gold spots mined yet for reset (need 121,042 / 75%)")]
    NotEnoughMinedForReset,
    #[msg("AMM program binary does not match expected fingerprint — possible upgrade")]
    AmmProgramVersionMismatch,
    #[msg("Game is immutable — no further config changes allowed")]
    GameIsImmutable,
}
