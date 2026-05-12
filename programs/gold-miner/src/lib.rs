use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_2022::{Token2022, MintTo, mint_to};
use anchor_spl::token_interface::{Mint, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;

// Gold Miner - On-chain multiplayer grid game on X1
// Grid: 100x100, gold at positions where (x & y) % 7 == 0
// Players move with session keys, auto-mine gold on arrival

declare_id!("EkThFJFcQtC9vmguQWQu6qhbndCkCaFFvuGX5MSsgGAf");

pub const GRID_SIZE: u32 = 100;
pub const GOLD_PER_MINE: u64 = 100;
pub const GOLDIUM_DECIMALS: u8 = 9;
pub const SESSION_DURATION_SLOTS: u64 = 36000; // ~4 hours at 400ms/block
pub const MOVE_GAS_LAMPORTS: u64 = 2_000_000; // 0.002 XNT

#[program]
pub mod gold_miner {
    use super::*;

    /// Initialize the game - creates config + Goldium mint
    pub fn initialize_game(ctx: Context<InitializeGame>) -> Result<()> {
        let config = &mut ctx.accounts.game_config;
        config.authority = ctx.accounts.authority.key();
        config.grid_size = GRID_SIZE;
        config.goldium_mint = ctx.accounts.goldium_mint.key();
        config.total_gold_mined = 0;
        config.move_fee_lamports = MOVE_GAS_LAMPORTS;
        config.bump = ctx.bumps.game_config;

        msg!("Game initialized! Grid: {}x{}", GRID_SIZE, GRID_SIZE);
        Ok(())
    }

    /// Join the game - creates player account at (1,1)
    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        player.wallet = ctx.accounts.wallet.key();
        player.position_x = 1;
        player.position_y = 1;
        player.goldium_minted = 0;
        player.session_key = Pubkey::default();
        player.session_expires_at = 0;
        player.bump = ctx.bumps.player;

        msg!("Player joined at position (1,1)");
        Ok(())
    }

    /// Start or rotate session key - wallet signs this, session key gets authorized
    pub fn start_session(ctx: Context<StartSession>, session_key: Pubkey) -> Result<()> {
        let player = &mut ctx.accounts.player;
        let clock = Clock::get()?;

        player.session_key = session_key;
        player.session_expires_at = clock.slot + SESSION_DURATION_SLOTS;

        msg!(
            "Session started. Key: {}, Expires at slot: {}",
            session_key,
            player.session_expires_at
        );
        Ok(())
    }

    /// Move player - signed by session key, not wallet
    pub fn move_player(ctx: Context<MovePlayer>, direction: Direction) -> Result<()> {
        let player = &mut ctx.accounts.player;
        let clock = Clock::get()?;

        // Verify session key
        require!(
            player.session_key == ctx.accounts.session_signer.key(),
            GoldMinerError::InvalidSessionKey
        );

        // Verify session hasn't expired
        require!(
            clock.slot <= player.session_expires_at,
            GoldMinerError::SessionExpired
        );

        // Calculate new position
        let (new_x, new_y) = match direction {
            Direction::Up => (player.position_x, player.position_y.saturating_add(1)),
            Direction::Down => (player.position_x, player.position_y.saturating_sub(1)),
            Direction::Left => (player.position_x.saturating_sub(1), player.position_y),
            Direction::Right => (player.position_x.saturating_add(1), player.position_y),
        };

        // Validate bounds (1..=GRID_SIZE)
        require!(new_x >= 1 && new_x <= GRID_SIZE, GoldMinerError::OutOfBounds);
        require!(new_y >= 1 && new_y <= GRID_SIZE, GoldMinerError::OutOfBounds);

        // Update position
        player.position_x = new_x;
        player.position_y = new_y;

        msg!("Player moved to ({}, {})", new_x, new_y);

        // Check for gold and mine if present
        if has_gold_at(new_x, new_y) && ctx.accounts.gold_spot.has_gold {
            // Mark gold as mined
            ctx.accounts.gold_spot.has_gold = false;
            ctx.accounts.gold_spot.mined_by = Some(player.wallet);

            // Update player stats
            player.goldium_minted = player.goldium_minted.saturating_add(GOLD_PER_MINE);

            // Update global counter
            ctx.accounts.game_config.total_gold_mined =
                ctx.accounts.game_config.total_gold_mined.saturating_add(1);

            // Mint Goldium tokens to player
            let config_bump = ctx.accounts.game_config.bump;
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"game_config",
                &[config_bump],
            ]];

            let cpi_accounts = MintTo {
                mint: ctx.accounts.goldium_mint.to_account_info(),
                to: ctx.accounts.player_token_account.to_account_info(),
                authority: ctx.accounts.game_config.to_account_info(),
            };
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                signer_seeds,
            );
            let amount = GOLD_PER_MINE
                .checked_mul(10u64.pow(GOLDIUM_DECIMALS as u32))
                .ok_or(GoldMinerError::ArithmeticOverflow)?;
            mint_to(cpi_ctx, amount)?;

            msg!(
                "GOLD MINED! +{} Goldium at position ({}, {})",
                GOLD_PER_MINE,
                new_x,
                new_y
            );
        }

        Ok(())
    }

    /// Deposit XNT into player escrow for gas
    pub fn deposit_xnt(ctx: Context<DepositXnt>, amount_lamports: u64) -> Result<()> {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.wallet.to_account_info(),
                    to: ctx.accounts.player.to_account_info(),
                },
            ),
            amount_lamports,
        )?;

        msg!("Deposited {} lamports to escrow", amount_lamports);
        Ok(())
    }

    /// Withdraw all XNT from escrow back to wallet
    pub fn withdraw_xnt(ctx: Context<WithdrawXnt>) -> Result<()> {
        let player = &ctx.accounts.player;
        let escrow_balance = player.to_account_info().lamports();
        let min_rent = Rent::get()?.minimum_balance(Player::SIZE);
        let withdraw_amount = escrow_balance.saturating_sub(min_rent);

        require!(withdraw_amount > 0, GoldMinerError::NoFundsToWithdraw);

        // Direct lamport transfer: subtract from player PDA, add to wallet.
        // SystemProgram::transfer cannot be used because the player PDA
        // carries data (Anchor account), which SystemProgram rejects with
        // "from must not carry data".
        let player_info = player.to_account_info();
        **player_info.try_borrow_mut_lamports()? -= withdraw_amount;
        **ctx.accounts.wallet.to_account_info().try_borrow_mut_lamports()? += withdraw_amount;

        msg!("Withdrew {} lamports from escrow", withdraw_amount);
        Ok(())
    }
}

/// Check if a grid position has gold based on worldgen formula
fn has_gold_at(x: u32, y: u32) -> bool {
    (x & y) % 7 == 0
}

// ── Account Structs ──

#[account]
pub struct GameConfig {
    pub authority: Pubkey,
    pub grid_size: u32,
    pub goldium_mint: Pubkey,
    pub total_gold_mined: u64,
    pub move_fee_lamports: u64,
    pub bump: u8,
}

impl GameConfig {
    pub const SIZE: usize = 8 + 32 + 4 + 32 + 8 + 8 + 1;
}

#[account]
pub struct Player {
    pub wallet: Pubkey,
    pub session_key: Pubkey,
    pub position_x: u32,
    pub position_y: u32,
    pub goldium_minted: u64,
    pub session_expires_at: u64,
    pub bump: u8,
}

impl Player {
    pub const SIZE: usize = 8 + 32 + 32 + 4 + 4 + 8 + 8 + 1;
}

#[account]
pub struct GoldSpot {
    pub has_gold: bool,
    pub mined_by: Option<Pubkey>,
}

impl GoldSpot {
    pub const SIZE: usize = 8 + 1 + 33;
}

impl Default for GoldSpot {
    fn default() -> Self {
        Self {
            has_gold: true,
            mined_by: None,
        }
    }
}

// ── Instruction Accounts ──

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = GameConfig::SIZE,
        seeds = [b"game_config"],
        bump,
    )]
    pub game_config: Account<'info, GameConfig>,

    /// CHECK: Goldium mint passed in, created externally or as PDA
    #[account(mut)]
    pub goldium_mint: AccountInfo<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    #[account(
        init,
        payer = wallet,
        space = Player::SIZE,
        seeds = [b"player", wallet.key().as_ref()],
        bump,
    )]
    pub player: Account<'info, Player>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartSession<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    #[account(
        mut,
        seeds = [b"player", wallet.key().as_ref()],
        bump = player.bump,
    )]
    pub player: Account<'info, Player>,
}

#[derive(Accounts)]
pub struct MovePlayer<'info> {
    /// Session key signer - authorized to move but nothing else
    pub session_signer: Signer<'info>,

    #[account(mut)]
    pub game_config: Account<'info, GameConfig>,

    #[account(
        mut,
        seeds = [b"player", player.wallet.as_ref()],
        bump = player.bump,
        constraint = player.session_key == session_signer.key() @ GoldMinerError::InvalidSessionKey,
    )]
    pub player: Account<'info, Player>,

    /// Gold spot PDA at the player's current position (after move)
    /// Seeds: ["gold_spot", x.to_be_bytes(), y.to_be_bytes()]
    /// Using 4-byte big-endian for u32 positions
    #[account(
        mut,
        seeds = [
            b"gold_spot",
            player.position_x.to_be_bytes().as_ref(),
            player.position_y.to_be_bytes().as_ref(),
        ],
        bump,
    )]
    pub gold_spot: Account<'info, GoldSpot>,

    #[account(mut)]
    pub goldium_mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Associated token account for player's Goldium, validated by ATA program
    #[account(
        mut,
        associated_token::mint = goldium_mint,
        associated_token::authority = player,
        associated_token::token_program = token_program,
    )]
    pub player_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositXnt<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    #[account(
        mut,
        seeds = [b"player", wallet.key().as_ref()],
        bump = player.bump,
    )]
    pub player: Account<'info, Player>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawXnt<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,

    #[account(
        mut,
        seeds = [b"player", wallet.key().as_ref()],
        bump = player.bump,
        has_one = wallet,
    )]
    pub player: Account<'info, Player>,

    pub system_program: Program<'info, System>,
}

// ── Types ──

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
    #[msg("Session has expired")]
    SessionExpired,
    #[msg("Move out of bounds")]
    OutOfBounds,
    #[msg("No funds to withdraw")]
    NoFundsToWithdraw,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}