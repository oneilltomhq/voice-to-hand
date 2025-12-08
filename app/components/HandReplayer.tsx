"use client";

import { useState, useMemo, useEffect } from "react";
import { OHHData } from "@/app/lib/OpenHandHistory";
import {
  calculateGameState,
  Cursor,
  getNextCursor,
  getPrevCursor,
  TableState,
} from "@/app/lib/poker-state-calculator";

interface HandReplayerProps {
  history: OHHData;
  latestPatch?: { patches: any[]; timestamp: string } | null;
}

export function HandReplayer({ history, latestPatch }: HandReplayerProps) {
  // Start at the beginning (-1 on first round, or just 0, -1)
  const [cursor, setCursor] = useState<Cursor>({ roundIdx: 0, actionIdx: -1 });
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  
  // If history changes (e.g. live update), deciding whether to auto-scroll is a UX choice.
  // For now, let's just ensure if the history completely resets, we reset cursor.
  useEffect(() => {
     // If our cursor is out of bounds (e.g. history cleared), reset
     if (!history.rounds[cursor.roundIdx]) {
         setCursor({ roundIdx: 0, actionIdx: -1 });
         setIsAutoPlaying(false);
     }
  }, [history, cursor.roundIdx]);

  // Smart Autoplay: When a new patch arrives, jump to the earliest change and play
  useEffect(() => {
    if (!latestPatch || !latestPatch.patches || latestPatch.patches.length === 0) return;

    let minRound = Infinity;
    let minAction = Infinity;

    // helper to update min cursor
    const updateMin = (r: number, a: number) => {
      if (r < minRound) {
        minRound = r;
        minAction = a;
      } else if (r === minRound && a < minAction) {
        minAction = a;
      }
    };

    // 1. Parse patches to find the earliest affected frame
    latestPatch.patches.forEach((op) => {
      const path = op.path as string;
      
      // Match "/rounds/{index}" or "/rounds/{index}/actions/{index}"
      const roundMatch = path.match(/\/rounds\/(\d+|-)($|\/)/);
      
      if (roundMatch) {
        const rIdx = roundMatch[1] === "-" ? history.rounds.length - 1 : parseInt(roundMatch[1], 10);
        
        const actionMatch = path.match(/\/actions\/(\d+|-)/);
        if (actionMatch) {
             // It's a specific action change
             // If "-", it means end of array. We use the current length - 1
             let aIdx = actionMatch[1] === "-" 
                ? (history.rounds[rIdx]?.actions.length ?? 0) - 1
                : parseInt(actionMatch[1], 10);
             
             updateMin(rIdx, aIdx);
        } else {
             // It's a round-level change (or new round), start at beginning of that round
             updateMin(rIdx, -1);
        }
      } else {
        // Global change (players, dealer, etc), restart whole hand
        updateMin(0, -1);
      }
    });

    // 2. Move Cursor
    if (minRound !== Infinity) {
      // Ensure we don't go out of bounds
      const validRound = Math.min(minRound, history.rounds.length - 1);
      
      if (validRound < 0) {
          // No rounds yet
          setCursor({ roundIdx: 0, actionIdx: -1 });
          return;
      }

      const round = history.rounds[validRound];
      const validAction = Math.min(minAction, (round.actions?.length || 0) - 1);

      setCursor({ roundIdx: validRound, actionIdx: validAction });
      setIsAutoPlaying(true);
    }
  }, [latestPatch, history]);

  // Autoplay Tick
  useEffect(() => {
    if (!isAutoPlaying) return;

    const timer = setTimeout(() => {
      const next = getNextCursor(history, cursor);
      if (next) {
        setCursor(next);
      } else {
        setIsAutoPlaying(false); // Reached the end
      }
    }, 800); // 800ms delay between moves

    return () => clearTimeout(timer);
  }, [isAutoPlaying, cursor, history]);

  const state: TableState = useMemo(
    () => calculateGameState(history, cursor),
    [history, cursor]
  );

  const handleNext = () => {
    setIsAutoPlaying(false);
    const next = getNextCursor(history, cursor);
    if (next) setCursor(next);
  };

  const handlePrev = () => {
    setIsAutoPlaying(false);
    const prev = getPrevCursor(history, cursor);
    if (prev) setCursor(prev);
  };

  const handleReset = () => {
    setIsAutoPlaying(false);
    setCursor({ roundIdx: 0, actionIdx: -1 });
  };
  
  const handleEnd = () => {
      setIsAutoPlaying(false);
      // Fast forward to the absolute last valid cursor
      let lastRoundIdx = history.rounds.length - 1;
      if (lastRoundIdx < 0) return; // Empty history
      
      let lastActionIdx = history.rounds[lastRoundIdx].actions.length - 1;
      setCursor({ roundIdx: lastRoundIdx, actionIdx: lastActionIdx });
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-800 rounded-xl shadow-xl text-white font-sans">
      {/* Header / Controls */}
      <div className="flex justify-between items-center border-b border-slate-700 pb-4">
        <div>
          <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
             Hand Replayer
             {isAutoPlaying && <span className="text-[10px] bg-green-900 text-green-300 px-2 py-0.5 rounded animate-pulse">PLAYING</span>}
          </h2>
          <div className="text-xs text-slate-400">
            {state.currentStreetName} • Action: {cursor.roundIdx}:{cursor.actionIdx}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs"
          >
            Start
          </button>
          <button
            onClick={handlePrev}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs"
            disabled={!getPrevCursor(history, cursor)}
          >
            Prev
          </button>
          <button
            onClick={handleNext}
            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-xs font-bold"
            disabled={!getNextCursor(history, cursor)}
          >
            Next
          </button>
           <button
            onClick={handleEnd}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs"
          >
            End
          </button>
        </div>
      </div>

      {/* The Table (Visual) */}
      <div className="relative w-full aspect-video bg-emerald-900 rounded-full border-8 border-emerald-950 shadow-inner flex items-center justify-center">
        
        {/* Center Info (Pot & Board) */}
        <div className="flex flex-col items-center gap-2 z-10">
           <div className="bg-black/30 px-4 py-1 rounded-full text-emerald-200 font-mono text-sm">
              Pot: {state.pot}
           </div>
           <div className="flex gap-2 min-h-[60px]">
              {state.communityCards.length > 0 ? (
                state.communityCards.map((card, i) => (
                  <CardView key={i} card={card} />
                ))
              ) : (
                <div className="text-emerald-800/50 text-xs flex items-center">No Board</div>
              )}
           </div>
        </div>

        {/* Players (Positioned around) */}
        {Array.from({ length: history.table_size || 8 }).map((_, i) => {
           const seatNum = i + 1;
           const player = state.players.find(p => p.seat === seatNum);
           
           // Calculate position on ellipse based on SEAT NUMBER, not player index
           // We want Seat 1 to be at a specific fixed position (e.g., bottom right or bottom center)
           // Let's rotate so Seat 1 is at ~ 6 o'clock (bottom)
           const totalSeats = history.table_size || 8;
           
           // Adjust angle so Seat 1 is at bottom.
           // 0 is Right (3 o'clock). PI/2 is Bottom (6 o'clock).
           // For 8 handed: 
           // Seat 1: 90 deg (PI/2)
           // Seat 2: 90 + 45 deg
           // ...
           // We actually want the dealer button (Seat 1 usually SB in 8-handed mapping?) wait.
           // Standard online poker view: Hero is usually bottom center.
           // We don't know who Hero is easily here without checking props or state, 
           // but let's just fix the seats physically first.
           
           // Distribute 360 degrees (2*PI) by totalSeats.
           // Offset by PI/2 to start at bottom.
           const angleStep = (2 * Math.PI) / totalSeats;
           const angle = (seatNum - 1) * angleStep + (Math.PI / 2);
           
           const rx = 40; // %
           const ry = 35; // %
           
           const left = 50 + rx * Math.cos(angle);
           const top = 50 + ry * Math.sin(angle);

           if (!player) {
             // Render Empty Seat
             return (
                <div
                    key={`seat-${seatNum}`}
                    className="absolute w-8 h-8 border-2 border-slate-700/50 rounded-full bg-slate-800/30 flex items-center justify-center text-slate-600/50 text-xs transform -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${left}%`, top: `${top}%` }}
                >
                    {seatNum}
                </div>
             );
           }

           return (
             <div
               key={player.id}
               className={`absolute transition-all duration-300 transform -translate-x-1/2 -translate-y-1/2
                 ${player.isActive ? 'scale-110 z-20' : 'scale-100 z-10'}
                 ${player.isFolded ? 'opacity-50 grayscale' : 'opacity-100'}
               `}
               style={{ left: `${left}%`, top: `${top}%` }}
             >
                <div className="flex flex-col items-center">
                   {/* Dealer Button */}
                   {player.seat === state.dealerSeat && (
                     <div className="mb-1 w-4 h-4 bg-white text-slate-900 rounded-full flex items-center justify-center text-[8px] font-bold border border-slate-300">
                       D
                     </div>
                   )}
                   
                   {/* Avatar/Info Box */}
                   <div className={`relative px-3 py-2 rounded-lg border-2 min-w-[80px] text-center flex flex-col items-center
                      ${player.isActive ? 'bg-slate-800 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'bg-slate-800/90 border-slate-600'}
                   `}>
                      <div className="text-[10px] uppercase text-slate-400 font-bold truncate max-w-[70px]">{player.name}</div>
                      <div className="text-xs font-mono text-white">{String(player.currentStack)}</div>
                      
                      {/* Hole Cards */}
                      <div className="flex -space-x-2 mt-1 h-8">
                         {player.holeCards ? (
                             player.holeCards.map((c, i) => <CardView key={i} card={c} small />)
                         ) : (
                             <>
                               <div className="w-5 h-7 bg-blue-900 rounded border border-white/20" />
                               <div className="w-5 h-7 bg-blue-900 rounded border border-white/20" />
                             </>
                         )}
                      </div>
                      
                      {/* Action Bubble */}
                      {player.lastAction && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white text-slate-900 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-lg border border-slate-200 animate-in fade-in zoom-in duration-200">
                           {player.lastAction}
                        </div>
                      )}
                      
                      {/* Current Wager (Chips in front) */}
                      {player.currentWager > 0 && (
                        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-yellow-500/20 text-yellow-200 px-2 py-0.5 rounded-md text-[10px] font-mono border border-yellow-500/50">
                          {player.currentWager}
                        </div>
                      )}
                   </div>
                </div>
             </div>
           );
        })}
      </div>
    </div>
  );
}

// Simple Card Component
function CardView({ card, small }: { card: string; small?: boolean }) {
   const rank = card.slice(0, -1);
   const suit = card.slice(-1);
   
   const getColor = (s: string) => {
       if (s === 'h' || s === 'd') return 'text-red-500';
       return 'text-slate-900';
   };
   
   const getSuitSymbol = (s: string) => {
       switch(s) {
           case 'h': return '♥';
           case 'd': return '♦';
           case 'c': return '♣';
           case 's': return '♠';
           default: return s;
       }
   };

   return (
     <div className={`
        bg-white rounded shadow-sm border border-slate-300 flex items-center justify-center font-bold select-none
        ${small ? 'w-5 h-7 text-[10px]' : 'w-10 h-14 text-sm'}
        ${getColor(suit)}
     `}>
       {rank}{getSuitSymbol(suit)}
     </div>
   );
}
