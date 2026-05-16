"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PublicKey, Connection, Transaction, TransactionInstruction, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as nacl from "tweetnacl";
import { Position, Direction, GoldSpot, OtherPlayer, PlayerState } from "@/types";
import {
  getProgramId,
  RPC_URL,
  GRID_SIZE,
  hasGoldAt,
  getViewportRange,
  getPlayerPda,
  getGameConfigPda,
  getGoldSpotPda,
  getPlayerGoldiumAta,
  GOLD_PER_MINE,
  getToken2022ProgramId,
  getAtaProgramId,
} from "@/lib/constants";

const CONFIRM_TIMEOUT_MS = 30_000; // 30s timeout for transaction confirmation

// Wrap confirmTransaction with a timeout so hung confirmations don't lock the UI
async function confirmWithTimeout(
  connection: Connection,
  args: { signature: string; blockhash: string; lastValidBlockHeight: number },
  commitment: "confirmed",
  timeoutMs = CONFIRM_TIMEOUT_MS
): Promise<{ value: { err: any } | null }> {
  return Promise.race([
    connection.confirmTransaction(args, commitment),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Transaction confirmation timed out")), timeoutMs)
    ),
  ]);
}

interface UseGameProps {
  sessionKeypair: nacl.SignKeyPair | null;
  sessionPubkey: PublicKey | null;
  playerState: PlayerState | null;
  fundSessionKey: (pubkey: PublicKey, blockhash: string, lvb: number) => Promise<void>;
  startSession: () => Promise<void>;
}

interface UseGameReturn {
  position: Position;
  visibleGold: GoldSpot[];
  visiblePlayers: OtherPlayer[];
  showPlayers: boolean;
  toggleShowPlayers: () => void;
  isMoving: boolean;
  lastMoveTime: number;
  move: (direction: Direction) => Promise<void>;
  canMove: boolean;
  goldMined: number;
  status: string;
}

const MOVE_COOLDOWN_MS = 400;

// Instruction discriminators
const MOVE_PLAYER_DISC = Buffer.from([17, 58, 68, 221, 186, 117, 140, 231]);
const MINE_GOLD_DISC = Buffer.from([49, 40, 243, 122, 219, 94, 234, 9]);
const MOVE_AND_MINE_DISC = Buffer.from([26, 202, 228, 63, 206, 4, 137, 63]);

// Direction enum variant index
const DIRECTION_VARIANT: Record<Direction, number> = {
  Up: 0,
  Down: 1,
  Left: 2,
  Right: 3,
};

export function useGame(props?: UseGameProps): UseGameReturn {
  const { sessionKeypair = null, sessionPubkey = null, playerState = null, fundSessionKey = async () => {}, startSession = async () => {} } = props ?? {};
  const [position, setPosition] = useState<Position>({ x: 1, y: 1 });
  const positionRef = useRef(position);
  positionRef.current = position;
  const [visibleGold, setVisibleGold] = useState<GoldSpot[]>([]);
  const [isMoving, setIsMoving] = useState(false);
  const [lastMoveTime, setLastMoveTime] = useState(0);
  const [goldMined, setGoldMined] = useState(0);
  const [visiblePlayers, setVisiblePlayers] = useState<OtherPlayer[]>([]);
  const [showPlayers, setShowPlayers] = useState(false);
  const [status, setStatus] = useState("");
  const connectionRef = useRef<Connection | null>(null);
  const goldiumMintRef = useRef<PublicKey | null>(null);
  const lastChainPositionRef = useRef<number>(0);

  const cachedBlockhashRef = useRef<{ blockhash: string; lastValidBlockHeight: number } | null>(null);
  const blockhashFetchRef = useRef<boolean>(false);
  const blockhashTimeRef = useRef<number>(0);

  const toggleShowPlayers = useCallback(() => {
    setShowPlayers(prev => !prev);
  }, []);

  useEffect(() => {
    if (!connectionRef.current) {
      connectionRef.current = new Connection(RPC_URL);
    }
  }, []);

  // Pre-cache blockhash every 30s
  useEffect(() => {
    const refresh = async () => {
      if (!connectionRef.current || blockhashFetchRef.current) return;
      blockhashFetchRef.current = true;
      try {
        const { blockhash, lastValidBlockHeight } = await connectionRef.current.getLatestBlockhash();
        cachedBlockhashRef.current = { blockhash, lastValidBlockHeight };
        blockhashTimeRef.current = Date.now();
      } catch (e) {
        console.warn("Failed to pre-cache blockhash:", e);
      } finally {
        blockhashFetchRef.current = false;
      }
    };
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  const getBlockhash = useCallback(async (): Promise<{ blockhash: string; lastValidBlockHeight: number }> => {
    if (!connectionRef.current) throw new Error("No connection");
    const cached = cachedBlockhashRef.current;
    const cacheAge = Date.now() - blockhashTimeRef.current;
    if (cached && cacheAge < 30_000) return cached;
    const fresh = await connectionRef.current.getLatestBlockhash();
    cachedBlockhashRef.current = fresh;
    blockhashTimeRef.current = Date.now();
    return fresh;
  }, []);

  const invalidateBlockhash = useCallback(() => {
    cachedBlockhashRef.current = null;
    blockhashTimeRef.current = 0;
  }, []);

  // Fetch goldium mint address once
  useEffect(() => {
    if (goldiumMintRef.current) return;
    (async () => {
      try {
        const conn = connectionRef.current!;
        const [gameConfigPda] = getGameConfigPda();
        const configInfo = await conn.getAccountInfo(gameConfigPda);
        if (configInfo) {
          goldiumMintRef.current = new PublicKey(configInfo.data.slice(44, 76));
        }
      } catch (e) {
        console.error("Failed to fetch goldium mint:", e);
      }
    })();
  }, []);

  // Sync gold count from playerState
  useEffect(() => {
    if (playerState) {
      setGoldMined(playerState.goldiumMinted);
    }
  }, [playerState]);

  // Load initial position from chain
  const initializedRef = useRef(false);
  useEffect(() => {
    if (playerState?.wallet && connectionRef.current) {
      if (!initializedRef.current) {
        setPosition(playerState.position);
      }
      const loadPosition = async () => {
        try {
          const programId = getProgramId();
          const [playerPda] = getPlayerPda(playerState.wallet!, programId);
          const accountInfo = await connectionRef.current!.getAccountInfo(playerPda, 'confirmed');
          if (accountInfo) {
            const posX = accountInfo.data.readUInt32LE(72);
            const posY = accountInfo.data.readUInt32LE(76);
            setPosition({ x: posX, y: posY });
          }
        } catch {}
        initializedRef.current = true;
      };
      loadPosition();
    }
  }, [playerState]);

  const updateVisibleGold = useCallback(async () => {
    const { minX, maxX, minY, maxY } = getViewportRange(position.x, position.y);
    const programId = getProgramId();
    const goldSpots: GoldSpot[] = [];

    const candidatePositions: [number, number][] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (hasGoldAt(x, y)) candidatePositions.push([x, y]);
      }
    }

    if (candidatePositions.length > 0 && connectionRef.current) {
      try {
        const pdas = candidatePositions.map(([x, y]) => {
          const xBuf = Buffer.alloc(4);
          xBuf.writeUInt32BE(x, 0);
          const yBuf = Buffer.alloc(4);
          yBuf.writeUInt32BE(y, 0);
          return PublicKey.findProgramAddressSync(
            [Buffer.from("gold_spot"), xBuf, yBuf],
            programId
          )[0];
        });

        const accounts = await connectionRef.current.getMultipleAccountsInfo(pdas, 'confirmed');
        const goldSpotDisc = Buffer.from([112, 156, 149, 108, 70, 90, 135, 242]);

        for (let i = 0; i < candidatePositions.length; i++) {
          const [x, y] = candidatePositions[i];
          const acct = accounts[i];

          if (acct && acct.data.slice(0, 8).equals(goldSpotDisc)) {
            const hasGold = acct.data[8] === 1;
            goldSpots.push({ x, y, hasGold });
          } else {
            goldSpots.push({ x, y, hasGold: true });
          }
        }
      } catch (e) {
        console.warn("Failed to fetch gold spots, assuming all available:", e);
        for (const [x, y] of candidatePositions) {
          goldSpots.push({ x, y, hasGold: true });
        }
      }
    }

    setVisibleGold(goldSpots);
  }, [position]);

  useEffect(() => { updateVisibleGold(); }, [updateVisibleGold]);

  // Move and mine in a single atomic TX
  const move = useCallback(
    async (direction: Direction) => {
      if (!sessionKeypair || !sessionPubkey || !playerState || !connectionRef.current) return;

      const now = Date.now();
      if (now - lastMoveTime < MOVE_COOLDOWN_MS) return;

      const curPos = positionRef.current;
      let newX = curPos.x, newY = curPos.y;
      switch (direction) {
        case Direction.Up:    newY = Math.min(GRID_SIZE, curPos.y + 1); break;
        case Direction.Down:  newY = Math.max(1, curPos.y - 1); break;
        case Direction.Left:  newX = Math.max(1, curPos.x - 1); break;
        case Direction.Right: newX = Math.min(GRID_SIZE, curPos.x + 1); break;
      }
      if (newX === curPos.x && newY === curPos.y) return;

      setIsMoving(true);
      setLastMoveTime(now);
      setPosition({ x: newX, y: newY }); // Optimistic
      setStatus("Moving...");

      try {
        const programId = getProgramId();
        const sessionSigner = Keypair.fromSecretKey(sessionKeypair.secretKey);

        // Check session key balance
        const balance = await connectionRef.current.getBalance(sessionSigner.publicKey);
        if (balance < 500_000) {
          const { blockhash: fundBh, lastValidBlockHeight: fundLvb } = await getBlockhash();
          try {
            await fundSessionKey(sessionSigner.publicKey, fundBh, fundLvb);
            await new Promise(r => setTimeout(r, 500));
          } catch (e) {
            console.error("Failed to fund session key:", e);
            setIsMoving(false);
            setPosition({ x: positionRef.current.x, y: positionRef.current.y });
            setStatus("");
            return;
          }
        }

        const walletPk = playerState.wallet;
        if (!walletPk) { setPosition(playerState.position); return; }
        
        const [playerPda] = getPlayerPda(walletPk, programId);
        const [gameConfigPda] = getGameConfigPda();
        const [goldSpotPda] = getGoldSpotPda(newX, newY, programId);
        
        if (!goldiumMintRef.current) {
          throw new Error("Goldium mint not loaded");
        }
        const goldiumMint = goldiumMintRef.current;
        const playerAta = getPlayerGoldiumAta(goldiumMint, walletPk);
        const tokenProgram = getToken2022ProgramId();
        const ataProgram = getAtaProgramId();

        // Build instruction data: discriminator + direction + newX + newY
        // newX and newY are u32 (4 bytes each, little-endian as per Anchor)
        const newXBuf = Buffer.alloc(4);
        newXBuf.writeUInt32LE(newX, 0);
        const newYBuf = Buffer.alloc(4);
        newYBuf.writeUInt32LE(newY, 0);
        
        const data = Buffer.concat([
          MOVE_AND_MINE_DISC,
          Buffer.from([DIRECTION_VARIANT[direction]]),
          newXBuf,
          newYBuf
        ]);

        // Create ATA idempotently if needed — owned by wallet, not Player PDA
        const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
          sessionSigner.publicKey,
          playerAta,
          walletPk,
          goldiumMint,
          tokenProgram,
          ataProgram
        );

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: sessionSigner.publicKey, isSigner: true, isWritable: true },   // session_signer (mut)
            { pubkey: gameConfigPda, isSigner: false, isWritable: true },              // game_config
            { pubkey: playerPda, isSigner: false, isWritable: true },                 // player
            // wallet comes before goldium_mint so index matches Rust struct order
            { pubkey: walletPk, isSigner: false, isWritable: true },                    // wallet (GLD owner)
            { pubkey: goldiumMint, isSigner: false, isWritable: true },                // goldium_mint
            { pubkey: tokenProgram, isSigner: false, isWritable: false },                // token_program
            { pubkey: ataProgram, isSigner: false, isWritable: false },                   // associated_token_program
            { pubkey: playerAta, isSigner: false, isWritable: true },                  // player_token_account
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },      // system_program
            // gold_spot passed as remaining_accounts[0] — deployed program reads it from there
            { pubkey: goldSpotPda, isSigner: false, isWritable: true },                // gold_spot (remaining)
          ],
          programId,
          data,
        });

        const { blockhash, lastValidBlockHeight } = await getBlockhash();
        const tx = new Transaction({ feePayer: sessionSigner.publicKey, blockhash, lastValidBlockHeight });
        tx.add(createAtaIx);
        tx.add(ix);
        tx.sign(sessionSigner);

        const signature = await connectionRef.current.sendRawTransaction(
          tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" }
        );
        invalidateBlockhash();
        
        const result = await confirmWithTimeout(connectionRef.current,
          { signature, blockhash, lastValidBlockHeight },
          'confirmed'
        );

        if (result.value?.err) {
          console.error("Move TX failed on-chain:", result.value.err);
          setPosition({ x: positionRef.current.x, y: positionRef.current.y });
          setStatus("");
          return;
        }

        // TX confirmed — sync position from chain
        try {
          const accountInfo = await connectionRef.current.getAccountInfo(playerPda, 'confirmed');
          if (accountInfo) {
            const chainX = accountInfo.data.readUInt32LE(72);
            const chainY = accountInfo.data.readUInt32LE(76);
            setPosition({ x: chainX, y: chainY });
            
            // Check if gold was mined by checking the transaction logs or gold_spot account
            // For simplicity, check if gold_spot exists and is mined
            try {
              const goldSpotInfo = await connectionRef.current.getAccountInfo(goldSpotPda, 'confirmed');
              if (goldSpotInfo) {
                const hasGold = goldSpotInfo.data[8] === 1;
                if (!hasGold) {
                  // Gold was mined!
                  setGoldMined(prev => prev + GOLD_PER_MINE);
                  setStatus("Mined!");
                } else {
                  setStatus("Moved");
                }
              } else {
                setStatus("Moved");
              }
            } catch {
              setStatus("Moved");
            }
          } else {
            setPosition({ x: newX, y: newY });
            setStatus("Moved");
          }
        } catch {
          setPosition({ x: newX, y: newY });
          setStatus("Moved");
        }

        // Refresh visible gold
        updateVisibleGold();

      } catch (err: any) {
        const errMsg = String(err?.message || "");

        // "This transaction has already been processed" means success
        if (errMsg.includes("already been processed")) {
          try {
            const programId = getProgramId();
            const wallet = playerState?.wallet;
            if (wallet) {
              const [pda] = getPlayerPda(wallet, programId);
              const info = await connectionRef.current.getAccountInfo(pda, 'confirmed');
              if (info) {
                const chainX = info.data.readUInt32LE(72);
                const chainY = info.data.readUInt32LE(76);
                setPosition({ x: chainX, y: chainY });
              } else {
                setPosition({ x: newX, y: newY });
              }
            } else {
              setPosition({ x: newX, y: newY });
            }
          } catch {
            setPosition({ x: newX, y: newY });
          }
          setStatus("");
          return;
        }

        console.error("Move failed:", err);

        // Retry on insufficient funds
        if (errMsg.includes("Insufficient funds") || errMsg.includes("insufficient")) {
          try {
            const retryProgramId = getProgramId();
            const retrySigner = Keypair.fromSecretKey(sessionKeypair!.secretKey);
            const retryWalletPk = playerState!.wallet;
            if (retryWalletPk) {
              const { blockhash: fundBh, lastValidBlockHeight: fundLvb } = await getBlockhash();
              await fundSessionKey(retrySigner.publicKey, fundBh, fundLvb);
              await new Promise(r => setTimeout(r, 500));
              
              // Retry with same logic
              const [playerPda] = getPlayerPda(retryWalletPk, retryProgramId);
              const [gameConfigPda] = getGameConfigPda();
              const [goldSpotPda] = getGoldSpotPda(newX, newY, retryProgramId);
              const goldiumMint = goldiumMintRef.current!;
              const playerAta = getPlayerGoldiumAta(goldiumMint, retryWalletPk);
              const tokenProgram = getToken2022ProgramId();
              const ataProgram = getAtaProgramId();

              const newXBuf = Buffer.alloc(4);
              newXBuf.writeUInt32LE(newX, 0);
              const newYBuf = Buffer.alloc(4);
              newYBuf.writeUInt32LE(newY, 0);
              
              const retryData = Buffer.concat([
                MOVE_AND_MINE_DISC,
                Buffer.from([DIRECTION_VARIANT[direction]]),
                newXBuf,
                newYBuf
              ]);

              const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
                retrySigner.publicKey,
                playerAta,
                retryWalletPk,
                goldiumMint,
                tokenProgram,
                ataProgram
              );

              const retryIx = new TransactionInstruction({
                keys: [
                  { pubkey: retrySigner.publicKey, isSigner: true, isWritable: true },
                  { pubkey: gameConfigPda, isSigner: false, isWritable: true },
                  { pubkey: playerPda, isSigner: false, isWritable: true },
                  { pubkey: retryWalletPk, isSigner: false, isWritable: true },
                  { pubkey: goldiumMint, isSigner: false, isWritable: true },
                  { pubkey: tokenProgram, isSigner: false, isWritable: false },
                  { pubkey: ataProgram, isSigner: false, isWritable: false },
                  { pubkey: playerAta, isSigner: false, isWritable: true },
                  { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                  // gold_spot passed as remaining_accounts[0]
                  { pubkey: goldSpotPda, isSigner: false, isWritable: true },
                ],
                programId: retryProgramId,
                data: retryData,
              });

              const { blockhash: retryBh, lastValidBlockHeight: retryLvb } = await getBlockhash();
              const retryTx = new Transaction({ feePayer: retrySigner.publicKey, blockhash: retryBh, lastValidBlockHeight: retryLvb });
              retryTx.add(createAtaIx);
              retryTx.add(retryIx);
              retryTx.sign(retrySigner);

              const retrySig = await connectionRef.current!.sendRawTransaction(
                retryTx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" }
              );
              invalidateBlockhash();
              
              const retryResult = await confirmWithTimeout(connectionRef.current!,
                { signature: retrySig, blockhash: retryBh, lastValidBlockHeight: retryLvb },
                'confirmed'
              );
              
              if (!retryResult.value?.err) {
                const rpInfo = await connectionRef.current!.getAccountInfo(playerPda, 'confirmed');
                if (rpInfo) {
                  setPosition({ x: rpInfo.data.readUInt32LE(72), y: rpInfo.data.readUInt32LE(76) });
                }
                setStatus("");
                return;
              }
            }
          } catch (retryErr) {
            console.error("Move retry failed:", retryErr);
          }
        }

        // Auto-renew session if expired (0x1771 = 6001 = SessionExpired)
        if (errMsg.includes("SessionExpired") || errMsg.includes("0x1771") || errMsg.includes("6001")) {
          setStatus("Session expired... renewing automatically");
          console.log("Session expired, attempting auto-renew...");
          try {
            await new Promise(r => setTimeout(r, 1000));
            await startSession();
            await new Promise(r => setTimeout(r, 1500));
            setIsMoving(false);
            setLastMoveTime(0);
            move(direction);
            return;
          } catch (renewErr) {
            console.error("Session auto-renewal failed:", renewErr);
            setStatus("Session expired. Click &#39;Start Session&#39; to renew.");
            setIsMoving(false);
            return;
          }
        }

        setStatus("");
        if (err?.name === "TransactionExpiredBlockheightExceededError" ||
            errMsg.includes("block height exceeded")) {
          invalidateBlockhash();
        }
        
        // Revert position
        try {
          const fallbackWalletPk = playerState.wallet;
          if (fallbackWalletPk) {
            const [pda] = getPlayerPda(fallbackWalletPk, getProgramId());
            const accountInfo = await connectionRef.current.getAccountInfo(pda, 'confirmed');
            if (accountInfo) {
              const posX = accountInfo.data.readUInt32LE(72);
              const posY = accountInfo.data.readUInt32LE(76);
              setPosition({ x: posX, y: posY });
            } else {
              setPosition({ x: positionRef.current.x, y: positionRef.current.y });
            }
          } else {
            setPosition({ x: positionRef.current.x, y: positionRef.current.y });
          }
        } catch {
          setPosition({ x: positionRef.current.x, y: positionRef.current.y });
        }
      } finally {
        setIsMoving(false);
      }
    },
    [sessionKeypair, sessionPubkey, playerState, position, lastMoveTime, fundSessionKey, startSession, getBlockhash, invalidateBlockhash, updateVisibleGold]
  );

  // Keyboard controls — use a ref so the listener is registered once and always calls the latest move
  const moveRef = useRef(move);
  moveRef.current = move;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const keyMap: { [key: string]: Direction } = {
        ArrowUp: Direction.Up, ArrowDown: Direction.Down,
        ArrowLeft: Direction.Left, ArrowRight: Direction.Right,
        w: Direction.Up, W: Direction.Up, s: Direction.Down, S: Direction.Down,
        a: Direction.Left, A: Direction.Left, d: Direction.Right, D: Direction.Right,
      };
      const direction = keyMap[e.key];
      if (direction) { e.preventDefault(); moveRef.current(direction); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // empty deps — registered once for the lifetime of the component

  const canMove = Boolean(sessionKeypair && sessionPubkey && playerState && !isMoving);
  return { position, visibleGold, visiblePlayers: [], showPlayers, toggleShowPlayers, isMoving, lastMoveTime, move, canMove, goldMined, status };
}
