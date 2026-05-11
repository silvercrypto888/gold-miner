use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_2022::{self, Token2022, MintTo, mint_to};
use anchor_spl::token_interface::{Mint, TokenAccount};

// Gold Miner - On-chain multiplayer grid game
// Grid: 100x100, gold at (x & y) % 7 == 0
// Players move with session keys, auto-mine gold

declare_id!("GM111111111111111111111111111111111111111111");

pub const GRID_SIZE: u16 = 100;
pub const GOLD_PER_MINE: u64 = 100;
pub const GOLDIUM_DECIMALS: u8 = 9;
pub const SESSION_DURATION_SLOTS: u64 = 36000; // ~4 hours at 400ms/block
pub const MOVE_GAS_LAMPORTS: u64 = 2_000_000; // 0.002 XNT

#[program]
pub mod gold_miner {
    use super::*;

    /// Initialize the game with config
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

    /// Join the game - creates player account
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

    /// Start/rotate session key - called once at start or to rotate keys
    pub fn start_session(
        ctx: Context<StartSession>,
        session_key: Pubkey,
    ) -> Result<()> {
        let player = &mut ctx.accounts.player;
        let clock = Clock::get()?;
        
        player.session_key = session_key;
        player.session_expires_at = clock.slot + SESSION_DURATION_SLOTS;
        
        msg!("Session started. Key: {}, Expires at slot: {}", session_key, player.session_expires_at);
        Ok(())
    }

    /// Move player in a direction - must be signed by session key
    pub fn move_player(
        ctx: Context<MovePlayer>,
        direction: Direction,
    ) -> Result<()> {
        let player = &mut ctx.accounts.player;
        let clock = Clock::get()?;
        
        // Verify session key is valid
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
            Direction::Up => (player.position_x, player.position_y + 1),
            Direction::Down => (player.position_x, player.position_y.saturating_sub(1)),
            Direction::Left => (player.position_x.saturating_sub(1), player.position_y),
            Direction::Right => (player.position_x + 1, player.position_y),
        };
        
        // Validate bounds
        require!(new_x >= 1 && new_x <= GRID_SIZE, GoldMinerError::OutOfBounds);
        require!(new_y >= 1 && new_y <= GRID_SIZE, GoldMinerError::OutOfBounds);
        
        // Update position
        player.position_x = new_x;
        player.position_y = new_y;
        
        msg!("Player moved to ({}, {})", new_x, new_y);
        
        // Check for gold at new position and mine if present
        if has_gold_at(new_x, new_y) {
            // Get or create GoldSpot account
            let gold_spot_seeds = &[
                b"gold_spot",
                &new_x.to_le_bytes(),
                &new_y.to_le_bytes(),
                &[ctx.bumps.gold_spot],
            ];
            
            // If gold exists, mine it
            if ctx.accounts.gold_spot.has_gold {
                // Mark as mined
                ctx.accounts.gold_spot.has_gold = false;
                ctx.accounts.gold_spot.mined_by = Some(player.wallet);
                
                // Update player's goldium count
                player.goldium_minted += GOLD_PER_MINE;
                
                // Update global counter
                ctx.accounts.game_config.total_gold_mined += 1;
                
                // Mint Goldium tokens to player
                let player_key = player.wallet;
                let seeds = &[
                    b"game_config",
                    &[ctx.accounts.game_config.bump],
                ];
                let signer = &[&seeds[..]];
                
                let cpi_accounts = MintTo {
                    mint: ctx.accounts.goldium_mint.to_account_info(),
                    to: ctx.accounts.player_token_account.to_account_info(),
                    authority: ctx.accounts.game_config.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    signer,
                );
                mint_to(cpi_ctx, GOLD_PER_MINE * 10u64.pow(GOLDIUM_DECIMALS as u32))?;
                
                msg!("GOLD MINED! +{} Goldium at position ({}, {})", GOLD_PER_MINE, new_x, new_y);
            }
        }
        
        Ok(())
    }

    /// Deposit XNT into escrow for gas fees
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

    /// Withdraw all XNT from escrow
    pub fn withdraw_xnt(ctx: Context<WithdrawXnt>) -> Result<()> {
        let player = &ctx.accounts.player;
        let escrow_balance = player.to_account_info().lamports();
        let min_rent = Rent::get()?.minimum_balance(Player::SIZE);
        
        // Only withdraw excess above rent exemption
        let withdraw_amount = escrow_balance.saturating_sub(min_rent);
        
        require!(withdraw_amount > 0, GoldMinerError::NoFundsToWithdraw);
        
        // Transfer from player PDA to wallet
        let player_key = player.wallet;
        let seeds = &[
            b"player",
            player_key.as_ref(),
            &[player.bump],
        ];
        let signer = &[&seeds[..]];
        
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.wallet.to_account_info(),
                },
                signer,
            ),
            withdraw_amount,
        )?;
        
        msg!("Withdrew {} lamports from escrow", withdraw_amount);
        Ok(())
    }
}

/// Check if a grid position has gold based on worldgen formula
fn has_gold_at(x: u16, y: u16) -> bool {
    ((x as u64) & (y as u64)) % 7 == 0
}

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = GameConfig::SIZE,
        seeds = [b"game_config"],
        bump
    )]
    pub game_config: Account<'info, GameConfig>,
    
    /// CHECK: Goldium mint - will be initialized separately
    #[account(mut)]
    pub goldium_mint: AccountInfo<'info>,
    
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
        bump
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
    /// Session key signer
    pub session_signer: Signer<'info>,
    
    #[account(mut)]
    pub game_config: Account<'info, GameConfig>,
    
    #[account(
        mut,
        seeds = [b"player", player.wallet.as_ref()],
        bump = player.bump,
    )]
    pub player: Account<'info, Player>,
    
    #[account(
        init_if_needed,
        payer = session_signer,
        space = GoldSpot::SIZE,
        seeds = [
            b"gold_spot",
            &player.position_x.to_le_bytes(),
            &player.position_y.to_le_bytes(),
        ],
        bump
    )]
    pub gold_spot: Account<'info, GoldSpot>,
    
    #[account(mut)]
    pub goldium_mint: InterfaceAccount<'info, Mint>,
    
    #[account(
        init_if_needed,
        payer = session_signer,
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

#[account]
pub struct GameConfig {
    pub authority: Pubkey,
    pub grid_size: u16,
    pub goldium_mint: Pubkey,
    pub total_gold_mined: u64,
    pub move_fee_lamports: u64,
    pub bump: u8,
}

#[account]
pub struct Player {
    pub wallet: Pubkey,
    pub session_key: Pubkey,
    pub position_x: u16,
    pub position_y: u16,
    pub goldium_minted: u64,
    pub session_expires_at: u64,
    pub bump: u8,
}

#[account]
pub struct GoldSpot {
    pub has_gold: bool,
    pub mined_by: Option<Pubkey>,
}

impl GameConfig {
    pub const SIZE: usize = 8 + // discriminator
        32 + // authority
        2 + // grid_size
        32 + // goldium_mint
        8 + // total_gold_mined
        8 + // move_fee_lamports
        1; // bump
}

impl Player {
    pub const SIZE: usize = 8 + // discriminator
        32 + // wallet
        32 + // session_key
        2 + // position_x
        2 + // position_y
        8 + // goldium_minted
        8 + // session_expires_at
        1; // bump
}

impl GoldSpot {
    pub const SIZE: usize = 8 + // discriminator
        1 + // has_gold
        33; // mined_by Option<Pubkey>
    
    pub fn has_gold_at_position(&self) -> bool {
        self.has_gold
    }
}

impl Default for GoldSpot {
    fn default() -> Self {
        Self {
            has_gold: true,
            mined_by: None,
        }
    }
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
    #[msg("Session has expired")]
    SessionExpired,
    #[msg("Move out of bounds")]
    OutOfBounds,
    #[msg("No funds to withdraw")]
    NoFundsToWithdraw,
    #[msg("Position already mined")]
    AlreadyMined,
}

use anchor_lang::error::ErrorCode;
use anchor_spl::associated_token::AssociatedToken;