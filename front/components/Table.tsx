
import React from 'react';
import { User, GameState } from '../types';
import { Check, Loader2, Crown } from 'lucide-react';

interface TableProps {
  gameState: GameState;
  currentUser: User | null;
  onReveal: () => void;
  onReset: () => void;
  onPromote: (userId: string) => void;
}

export const Table: React.FC<TableProps> = ({ gameState, currentUser, onReveal, onReset, onPromote }) => {
  const allVoted = gameState.users.length > 0 && gameState.users.every(u => gameState.votes[u.id] !== undefined);
  
  // Average calculation is handled in App.tsx logic via finalScore now, 
  // but for live view we can show it here if revealed.
  const average = React.useMemo(() => {
    if (!gameState.isRevealed) return 0;
    const numericVotes = Object.values(gameState.votes)
      .map(v => Number(v))
      .filter(n => !isNaN(n));
    if (numericVotes.length === 0) return 0;
    return (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1);
  }, [gameState.votes, gameState.isRevealed]);

  return (
    <div className="relative flex items-center justify-center w-full h-full min-h-[300px] md:min-h-[400px]">
      {/* Table Surface */}
      <div className="relative w-64 h-32 md:w-96 md:h-48 bg-slate-800 rounded-full border-4 border-slate-700 shadow-2xl flex flex-col items-center justify-center transition-all duration-500">
        
        {/* Center Content */}
        {!gameState.isRevealed ? (
          <div className="text-center">
            <p className="text-slate-400 text-sm uppercase tracking-widest font-semibold mb-2">
              {Object.keys(gameState.votes).length} / {gameState.users.length} Voted
            </p>
            {currentUser?.isHost && (
              <button
                onClick={onReveal}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-indigo-600/20 transition-all hover:scale-105"
              >
                Reveal Cards
              </button>
            )}
            {!currentUser?.isHost && (
              <div className="flex items-center gap-2 text-indigo-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Waiting for host...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center animate-in fade-in zoom-in duration-300">
            <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold">Average</p>
            <p className="text-4xl font-bold text-white mb-2">{average}</p>
            {currentUser?.isHost && (
              <button
                onClick={onReset}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-emerald-600/20 transition-all hover:scale-105"
              >
                Next Round
              </button>
            )}
          </div>
        )}

        {/* Player Avatars around the table */}
        {gameState.users.map((user, index) => {
          // Calculate position around the ellipse
          const total = gameState.users.length;
          const angle = (index / total) * 2 * Math.PI - Math.PI / 2; // Start from top
          const xRadius = 140; // Horizontal radius
          const yRadius = 90; // Vertical radius
          // Adjust radii for mobile
          const responsiveX = typeof window !== 'undefined' && window.innerWidth < 768 ? 100 : 180;
          const responsiveY = typeof window !== 'undefined' && window.innerWidth < 768 ? 80 : 120;
          
          const x = Math.cos(angle) * responsiveX;
          const y = Math.sin(angle) * responsiveY;

          const hasVoted = gameState.votes[user.id] !== undefined;
          const voteValue = gameState.votes[user.id];

          return (
            <div
              key={user.id}
              className="absolute flex flex-col items-center justify-center w-16 h-20 transition-all duration-500 group"
              style={{
                transform: `translate(${x}px, ${y}px)`,
                zIndex: 10
              }}
            >
              {/* The Card/Avatar Representation */}
              <div
                className={`
                  relative w-10 h-14 rounded border-2 flex items-center justify-center shadow-lg transition-all duration-500
                  ${
                    gameState.isRevealed
                      ? 'bg-slate-100 border-indigo-500 text-slate-900 text-xl font-bold rotate-0'
                      : hasVoted
                      ? 'bg-indigo-600 border-indigo-400 rotate-3 translate-y-1'
                      : 'bg-slate-700 border-slate-600 border-dashed opacity-50'
                  }
                `}
              >
                {/* Crown for Host */}
                {user.isHost && (
                   <div className="absolute -top-3 -right-2 bg-yellow-500 rounded-full p-0.5 shadow-sm z-20">
                       <Crown className="w-3 h-3 text-yellow-900" fill="currentColor" />
                   </div>
                )}

                {/* Promote Button (Only for Host viewing others) */}
                {currentUser?.isHost && !user.isHost && (
                    <button 
                        onClick={() => onPromote(user.id)}
                        className="absolute -bottom-2 -right-2 bg-slate-700 hover:bg-yellow-500 text-slate-300 hover:text-yellow-900 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all scale-75 hover:scale-110 z-20 border border-slate-500"
                        title="Promote to Host"
                    >
                        <Crown className="w-3 h-3" />
                    </button>
                )}

                {gameState.isRevealed ? (
                  voteValue
                ) : hasVoted ? (
                  <Check className="w-5 h-5 text-white" />
                ) : (
                  <span className="text-xs text-slate-400">...</span>
                )}
              </div>
              
              <div className="mt-2 text-center">
                <p className="text-xs font-medium text-slate-300 truncate max-w-[80px] px-1 bg-slate-900/80 rounded">
                  {user.name}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
