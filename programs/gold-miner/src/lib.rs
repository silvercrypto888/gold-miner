use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount, mint_to, MintTo};

declare_id!("GLDFuDjyt5rGBpu5nuZXC2BHR5XVfEYwgwrNC4Mi9Sq6");

pub const GRID_SIZE: u32 = 1024;
pub const GOLD_PER_MINE: u64 = 100;
pub const GOLD_DECIMALS: u8 = 9;
pub const SESSION_DURATION_SLOTS: u64 = 36000;
pub const BITMAP_BODY: usize = 131_072;
pub const BITMAP_ACCT: usize = BITMAP_BODY; // no discriminator — raw bytes

#[program]
pub mod gold_miner {
    use super::*;

    /// Init — creates GameConfig + stores the bitmap address. Bitmap must be pre-created by client.
    pub fn initialize_game(ctx: Context<InitializeGame>) -> Result<()> {
        let cfg = &mut ctx.accounts.game_config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.grid_size = GRID_SIZE;
        cfg.gold_mint = ctx.accounts.gold_mint.key();
        cfg.gold_bitmap = ctx.accounts.gold_bitmap.key();
        cfg.total_gold_mined = 0;
        cfg.bump = ctx.bumps.game_config;
        msg!("Game init. Grid {}x{}", GRID_SIZE, GRID_SIZE);
        Ok(())
    }

    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        let p = &mut ctx.accounts.player;
        p.wallet = ctx.accounts.wallet.key();
        p.position_x = 1; p.position_y = 1;
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
        player.position_x = nx; player.position_y = ny;

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

                let amount = GOLD_PER_MINE.checked_mul(10u64.pow(GOLD_DECIMALS as u32))
                    .ok_or(GoldMinerError::ArithmeticError)?;

                mint_to(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        MintTo {
                            mint: ctx.accounts.gold_mint.to_account_info(),
                            to: ctx.accounts.player_token_account.to_account_info(),
                            authority: ctx.accounts.game_config.to_account_info(),
                        },
                        &[&[b"game_config", &[ctx.accounts.game_config.bump]]],
                    ),
                    amount,
                )?;
                msg!("+{} GOLD at ({},{})", GOLD_PER_MINE, nx, ny);
            } else {
                msg!("Moved ({},{}) mined", nx, ny);
            }
        } else {
            msg!("Moved ({},{}) nogold", nx, ny);
        }
        Ok(())
    }
}

#[account]
#[derive(Default)]
pub struct GameConfig {
    pub authority: Pubkey,
    pub grid_size: u32,
    pub gold_mint: Pubkey,
    pub gold_bitmap: Pubkey,
    pub total_gold_mined: u64,
    pub bump: u8,
}
impl GameConfig { pub const SIZE: usize = 8 + 32 + 4 + 32 + 32 + 8 + 1; }

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

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = GameConfig::SIZE, seeds = [b"game_config"], bump)]
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
pub struct JoinGame<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(init, payer = wallet, space = Player::SIZE, seeds = [b"player", wallet.key().as_ref()], bump)]
    pub player: Account<'info, Player>,
    #[account(mut)]
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
    #[account(mut)]
    pub gold_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = gold_mint, associated_token::authority = player.wallet,
              associated_token::token_program = token_program)]
    pub player_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub enum Direction { Up, Down, Left, Right }

#[error_code]
pub enum GoldMinerError {
    #[msg("Invalid session key")] InvalidSessionKey,
    #[msg("Session expired")] SessionExpired,
    #[msg("Out of bounds")] OutOfBounds,
    #[msg("No funds")] NoFundsToWithdraw,
    #[msg("Arithmetic error")] ArithmeticError,
}
