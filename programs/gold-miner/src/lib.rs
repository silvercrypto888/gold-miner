use anchor_lang::prelude::*;
use anchor_lang::{Discriminator, solana_program::system_instruction};
use anchor_lang::system_program;
use anchor_spl::token_2022::{Token2022, MintTo, mint_to};
use anchor_spl::token_interface::{Mint, TokenAccount as TokenAccountInterface};
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
    /// This ONLY updates position. Gold mining is a separate instruction.
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
        Ok(())
    }

    /// Mine gold at player's current position - auto-creates GoldSpot if needed
    pub fn mine_gold(ctx: Context<MineGold>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        let gold_spot = &mut ctx.accounts.gold_spot;

        // Verify session key
        require!(
            player.session_key == ctx.accounts.session_signer.key(),
            GoldMinerError::InvalidSessionKey
        );

        // Verify session hasn't expired
        let clock = Clock::get()?;
        require!(
            clock.slot <= player.session_expires_at,
            GoldMinerError::SessionExpired
        );

        // Check worldgen - only positions where (x & y) % 7 == 0 have gold
        let has_gold = has_gold_at(player.position_x, player.position_y);
        require!(has_gold, GoldMinerError::NoGoldHere);

        // Verify gold hasn't been mined yet
        // Note: init_if_needed creates accounts with zero-initialized data,
        // so has_gold starts as false. We set it to true here for new accounts,
        // then immediately flip it to false (marking as mined).
        // For existing accounts, has_gold=true means unmined, has_gold=false means already mined.
        if !gold_spot.has_gold {
            // Check if this is a freshly created (zero-init) account
            // A truly mined spot will have mined_by = Some(pubkey)
            // A zero-init spot will have mined_by = None (all zeros)
            if gold_spot.mined_by.is_none() {
                // Freshly created by init_if_needed — this is the first mine at this spot
                gold_spot.has_gold = true; // Set before the flip
            } else {
                // Previously mined
                return Err(GoldMinerError::AlreadyMined.into());
            }
        }

        // Mark gold as mined
        gold_spot.has_gold = false;
        gold_spot.mined_by = Some(player.wallet);

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
            player.position_x,
            player.position_y
        );

        Ok(())
    }

    /// Move player and mine gold at the new position in a single atomic TX.
    /// If gold exists at the new position and hasn't been mined, mines it.
    /// If no gold at the new position, just completes the move.
    /// The client must pass new_x/new_y matching the direction result so the
    /// gold_spot PDA can be derived from the NEW position before the move.
    pub fn move_and_mine<'info>(
        ctx: Context<'_, '_, '_, 'info, MoveAndMine<'info>>,
        direction: Direction,
        new_x: u32,
        new_y: u32,
    ) -> Result<()> {
        let clock = Clock::get()?;

        // Verify session key
        require!(
            ctx.accounts.player.session_key == ctx.accounts.session_signer.key(),
            GoldMinerError::InvalidSessionKey
        );

        // Verify session hasn't expired
        require!(
            clock.slot <= ctx.accounts.player.session_expires_at,
            GoldMinerError::SessionExpired
        );

        // Calculate expected new position from direction
        let (expected_x, expected_y) = match direction {
            Direction::Up => (ctx.accounts.player.position_x, ctx.accounts.player.position_y.saturating_add(1)),
            Direction::Down => (ctx.accounts.player.position_x, ctx.accounts.player.position_y.saturating_sub(1)),
            Direction::Left => (ctx.accounts.player.position_x.saturating_sub(1), ctx.accounts.player.position_y),
            Direction::Right => (ctx.accounts.player.position_x.saturating_add(1), ctx.accounts.player.position_y),
        };

        // Verify client-provided coords match direction calculation
        require!(
            new_x == expected_x && new_y == expected_y,
            GoldMinerError::GoldSpotMismatch
        );

        // Validate bounds (1..=GRID_SIZE)
        require!(new_x >= 1 && new_x <= GRID_SIZE, GoldMinerError::OutOfBounds);
        require!(new_y >= 1 && new_y <= GRID_SIZE, GoldMinerError::OutOfBounds);

        // Get gold_spot from remaining_accounts and verify PDA
        let gold_spot_info = ctx.remaining_accounts.first()
            .ok_or(GoldMinerError::GoldSpotMismatch)?;
        let (expected_gold_spot, gold_spot_bump) = Pubkey::find_program_address(
            &[
                b"gold_spot",
                new_x.to_be_bytes().as_ref(),
                new_y.to_be_bytes().as_ref(),
            ],
            ctx.program_id,
        );
        require!(
            gold_spot_info.key() == expected_gold_spot,
            GoldMinerError::GoldSpotMismatch
        );

        // Create gold_spot account if needed (inline — avoids lifetime issues)
        if has_gold_at(new_x, new_y) {
            if gold_spot_info.data_len() == 0 && gold_spot_info.lamports() == 0 {
                let space = 8 + GoldSpot::SIZE as usize;
                let rent = Rent::get()?;
                let rent_lamports = rent.minimum_balance(space);
                let x_bytes = new_x.to_be_bytes();
                let y_bytes = new_y.to_be_bytes();
                let signer_seeds: &[&[&[u8]]] = &[&[
                    b"gold_spot" as &[u8],
                    x_bytes.as_ref(),
                    y_bytes.as_ref(),
                    &[gold_spot_bump],
                ]];
                let create_ix = system_instruction::create_account(
                    ctx.accounts.session_signer.key,
                    gold_spot_info.key,
                    rent_lamports,
                    space as u64,
                    ctx.program_id,
                );
                anchor_lang::solana_program::program::invoke_signed(
                    &create_ix,
                    &[
                        ctx.accounts.session_signer.to_account_info(),
                        gold_spot_info.clone(),
                        ctx.accounts.system_program.to_account_info(),
                    ],
                    signer_seeds,
                )?;
                // Initialize discriminator + mark has_gold = true for fresh account
                let mut data = gold_spot_info.data.borrow_mut();
                data[..8].copy_from_slice(&GoldSpot::DISCRIMINATOR);
                data[8] = 1; // has_gold = true
            }
        }

        // Now do mutable operations
        let player = &mut ctx.accounts.player;

        // Update position
        player.position_x = new_x;
        player.position_y = new_y;

        msg!("Player moved to ({}, {})", new_x, new_y);

        // Check if there's gold at the new position
        if has_gold_at(new_x, new_y) {
            // Read gold_spot data, extract what we need, then drop the borrow
            let should_mine = {
                let data = gold_spot_info.data.borrow();
                let disc = GoldSpot::DISCRIMINATOR;
                let valid_data = (0..8).all(|i| data[i] == disc[i]);
                if !valid_data {
                    // Fresh account — gold here, hasn't been mined
                    true
                } else {
                    // Existing account — check has_gold flag
                    data[8] != 0
                }
            }; // data borrow dropped here

            if !should_mine {
                return Ok(());
            }

            // Mine the gold!
            {
                let mut data = gold_spot_info.data.borrow_mut();
                let disc = GoldSpot::DISCRIMINATOR;
                data[..8].copy_from_slice(&disc);
                data[8] = 0; // has_gold = false
                data[9] = 1; // mined_by = Some
                data[10..42].copy_from_slice(player.wallet.as_ref());
            }

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

    #[account(
        mut,
        seeds = [b"player", player.wallet.as_ref()],
        bump = player.bump,
        constraint = player.session_key == session_signer.key() @ GoldMinerError::InvalidSessionKey,
    )]
    pub player: Account<'info, Player>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MineGold<'info> {
    /// Session key signer - pays for gold_spot creation if needed
    #[account(mut)]
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

    #[account(
        init_if_needed,
        payer = session_signer,
        space = 8 + GoldSpot::SIZE,
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

    /// Associated token account for player's Goldium — must be pre-created by frontend
    #[account(
        mut,
        associated_token::mint = goldium_mint,
        associated_token::authority = player,
        associated_token::token_program = token_program,
    )]
    pub player_token_account: InterfaceAccount<'info, TokenAccountInterface>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MoveAndMine<'info> {
    /// Session key signer - pays for gold_spot creation if needed
    #[account(mut)]
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

    /// NOTE: gold_spot is passed via remaining_accounts[0] instead of being
    /// declared here. This avoids Anchor's "signer privilege escalated" error
    /// because the PDA seeds depend on instruction args (new_x, new_y) which
    /// can't be expressed in struct constraints.
    ///
    /// IMPORTANT: wallet MUST come before player_token_account so Anchor can
    /// resolve the associated_token::authority and token_program references.
    /// Otherwise it reads the wrong account index.

    /// CHECK: the wallet that owns this player account
    #[account(
        mut,
        address = player.wallet @ GoldMinerError::InvalidSessionKey,
    )]
    pub wallet: AccountInfo<'info>,

    #[account(mut)]
    pub goldium_mint: InterfaceAccount<'info, Mint>,

    /// Token-2022 and ATA programs declared before player_token_account so
    /// Anchor can resolve associated_token constraints by name, not by index
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// Player's Goldium ATA, owned by wallet (not Player PDA)
    #[account(
        mut,
        associated_token::mint = goldium_mint,
        associated_token::authority = wallet,
        associated_token::token_program = token_program,
    )]
    pub player_token_account: InterfaceAccount<'info, TokenAccountInterface>,

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
    #[msg("Position already mined")]
    AlreadyMined,
    #[msg("No gold at this position")]
    NoGoldHere,
    #[msg("Gold spot account mismatch — must be derived from new position")]
    GoldSpotMismatch,
}