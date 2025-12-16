import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, LogIn, ArrowRight, ClipboardList, Copy, Link as LinkIcon, Menu, X, Loader2, LogOut, Server } from 'lucide-react';
import { socketService } from './services/socketService';
import { GameState, User, NetworkMessage, FIBONACCI_SEQ, Task } from './types';
import { Card } from './components/Card';
import { Table } from './components/Table';
import { TaskList } from './components/TaskList';

// Helper to generate IDs
const uuid = () => Math.random().toString(36).substring(2, 9);

// HARDCODED PRODUCTION SERVER
const SERVER_URL = 'function-bun-production-2fae.up.railway.app';

// Helper for finding closest Fibonacci
const getClosestFibonacci = (num: number): string | number => {
    // Filter numeric values from the sequence
    const fibNums = FIBONACCI_SEQ
        .map(v => parseInt(v))
        .filter(n => !isNaN(n));
    
    // Find closest
    const closest = fibNums.reduce((prev, curr) => {
        return (Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev);
    });
    
    return closest;
};

function App() {
  // Local UI State
  const [userName, setUserName] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  
  // Game State
  const [gameState, setGameState] = useState<GameState>({
    roomId: null,
    users: [],
    votes: {},
    tasks: [],
    currentTaskId: null,
    isRevealed: false,
  });

  // Keep a ref of game state for event handlers to access latest state without triggering re-renders/stale closures
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Handle incoming network messages
  const handleMessage = useCallback((msg: NetworkMessage) => {
    // Guard: Ignore messages if we aren't in a room yet (unless it's a join ack/local echo)
    if (gameStateRef.current.roomId && msg.roomId !== gameStateRef.current.roomId) return;

    switch (msg.type) {
      case 'JOIN': {
        const newUser = msg.payload;
        console.log('[App] User Joined:', newUser.name);

        setGameState(prev => {
          if (prev.users.some(u => u.id === newUser.id)) return prev;
          return { ...prev, users: [...prev.users, newUser] };
        });

        // Host Logic: Sync State to New User
        if (currentUserRef.current?.isHost && newUser.id !== currentUserRef.current.id) {
            const currentUsers = gameStateRef.current.users;
            const updatedUsers = currentUsers.some(u => u.id === newUser.id) 
                ? currentUsers 
                : [...currentUsers, newUser];

            const statePayload = {
                ...gameStateRef.current,
                users: updatedUsers
            };

            socketService.send({
                type: 'SYNC_RESPONSE',
                roomId: msg.roomId,
                senderId: currentUserRef.current.id,
                payload: statePayload
            });
        }
        break;
      }

      case 'USER_LEFT': {
          const leftUserId = msg.payload.id;
          console.log('[App] User Left:', leftUserId);

          setGameState(prev => {
              const leavingUser = prev.users.find(u => u.id === leftUserId);
              const remainingUsers = prev.users.filter(u => u.id !== leftUserId);
              
              // ADMIN SUCCESSION LOGIC
              let updatedUsers = remainingUsers;
              if (leavingUser?.isHost && remainingUsers.length > 0) {
                  // Promote the first user in the list (usually the oldest connection)
                  updatedUsers = remainingUsers.map((u, index) => 
                      index === 0 ? { ...u, isHost: true } : u
                  );
                  
                  // Check if *I* became the host
                  if (updatedUsers[0].id === currentUserRef.current?.id) {
                      console.log('[App] I have become the Host via succession');
                      setCurrentUser(prevUser => prevUser ? { ...prevUser, isHost: true } : null);
                  }
              }

              return {
                  ...prev,
                  users: updatedUsers,
                  votes: Object.fromEntries(
                      Object.entries(prev.votes).filter(([uid]) => uid !== leftUserId)
                  )
              };
          });
          break;
      }

      case 'PROMOTE_USER': {
          const targetUserId = msg.payload.targetUserId;
          setGameState(prev => {
              const updatedUsers = prev.users.map(u => ({
                  ...u,
                  isHost: u.id === targetUserId
              }));
              return { ...prev, users: updatedUsers };
          });

          // Update my own status if I was target or was old host
          if (currentUserRef.current) {
              if (currentUserRef.current.id === targetUserId) {
                  setCurrentUser({ ...currentUserRef.current, isHost: true });
              } else if (currentUserRef.current.isHost) {
                  setCurrentUser({ ...currentUserRef.current, isHost: false });
              }
          }
          break;
      }

      case 'SYNC_REQUEST':
        if (currentUserRef.current?.isHost) {
          socketService.send({
            type: 'SYNC_RESPONSE',
            roomId: msg.roomId,
            senderId: currentUserRef.current.id,
            payload: gameStateRef.current
          });
        }
        break;

      case 'SYNC_RESPONSE':
        setGameState(msg.payload);
        // Ensure my currentUser isHost flag is consistent with the synced state
        // If I am in the user list, sync my host status
        const meInState = msg.payload.users.find((u: User) => u.id === currentUserRef.current?.id);
        if (meInState && currentUserRef.current) {
             if (meInState.isHost !== currentUserRef.current.isHost) {
                 setCurrentUser({ ...currentUserRef.current, isHost: meInState.isHost });
             }
        }
        break;

      case 'VOTE':
        setGameState(prev => ({
          ...prev,
          votes: { ...prev.votes, [msg.payload.userId]: msg.payload.value }
        }));
        break;

      case 'REVEAL':
        setGameState(prev => ({ ...prev, isRevealed: true }));
        break;

      case 'RESET':
        setGameState(prev => {
            let updatedTasks = [...prev.tasks];
            if (prev.currentTaskId) {
               const votes = Object.values(prev.votes) as (string | number)[];
               
               // FEATURE 6: Closest Fibonacci to Average
               let finalScore: string | number | undefined;
               
               if (votes.length > 0) {
                   const numericVotes = votes
                       .map(v => Number(v))
                       .filter(n => !isNaN(n));
                   
                   if (numericVotes.length > 0) {
                       const sum = numericVotes.reduce((a, b) => a + b, 0);
                       const avg = sum / numericVotes.length;
                       finalScore = getClosestFibonacci(avg);
                   } else {
                       // Fallback for non-numeric (coffee, ?) - take most frequent
                       finalScore = (votes.sort((a,b) => 
                          votes.filter(v => v===a).length - votes.filter(v => v===b).length
                       ).pop()) as string | number | undefined;
                   }
               }
    
               updatedTasks = updatedTasks.map(t => 
                 t.id === prev.currentTaskId 
                   ? { ...t, status: 'completed', finalScore: finalScore } 
                   : t
               );
            }

            return {
              ...prev,
              isRevealed: false,
              votes: {},
              tasks: updatedTasks,
              currentTaskId: null
            };
        });
        break;

      case 'ADD_TASK':
        setGameState(prev => ({
          ...prev,
          tasks: [...prev.tasks, msg.payload]
        }));
        break;
    
      case 'DELETE_TASK':
        setGameState(prev => ({
           ...prev,
           tasks: prev.tasks.filter(t => t.id !== msg.payload),
           currentTaskId: prev.currentTaskId === msg.payload ? null : prev.currentTaskId
        }));
        break;

      case 'UPDATE_TASK':
        setGameState(prev => ({
            ...prev,
            tasks: prev.tasks.map(t => t.id === msg.payload.id ? { ...t, title: msg.payload.title } : t)
        }));
        break;

      case 'SELECT_TASK':
        setGameState(prev => ({
          ...prev,
          currentTaskId: msg.payload,
          votes: {},
          isRevealed: false
        }));
        break;
    }
  }, []); // Dependencies reduced since we use Ref

  useEffect(() => {
    const unsubscribe = socketService.subscribe(handleMessage);
    return () => unsubscribe();
  }, [handleMessage]);

  // Actions
  const createRoom = async () => {
    if (!userName.trim()) return;
    setIsConnecting(true);
    setErrorMsg(null);

    const newRoomId = uuid().substring(0, 5).toUpperCase();
    const newUser: User = { id: uuid(), name: userName, isHost: true };

    try {
      await socketService.connect(SERVER_URL);
      setCurrentUser(newUser);
      const initialTasks: Task[] = [{id: uuid(), title: 'First User Story', status: 'active'}];
      const initialState: GameState = {
        roomId: newRoomId,
        users: [newUser],
        votes: {},
        tasks: initialTasks,
        currentTaskId: initialTasks[0].id,
        isRevealed: false
      };
      setGameState(initialState);
      
      socketService.send({
          type: 'JOIN',
          roomId: newRoomId,
          payload: newUser,
          senderId: newUser.id
      });

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Connection failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  const joinRoom = async () => {
    if (!userName.trim() || !roomInput.trim()) return;
    setIsConnecting(true);
    setErrorMsg(null);

    const roomIdToJoin = roomInput.toUpperCase();
    const newUser: User = { id: uuid(), name: userName, isHost: false }; // Initially false

    try {
      await socketService.connect(SERVER_URL);
      setCurrentUser(newUser);
      
      // Temporarily set minimal state, waiting for sync
      setGameState(prev => ({ 
          ...prev, 
          roomId: roomIdToJoin,
          users: [newUser] 
      }));
      
      socketService.send({
        type: 'JOIN',
        roomId: roomIdToJoin,
        payload: newUser,
        senderId: newUser.id
      });
      
      // Check for empty room / Host auto-promotion
      // If we don't get a SYNC response in 1.5s, assume we are the first/only one
      setTimeout(() => {
          // Check ref directly to see if users list grew beyond just me
          if (gameStateRef.current.users.length <= 1) {
              console.log('No sync received, assuming empty room. Becoming Host.');
              setCurrentUser(prev => prev ? { ...prev, isHost: true } : null);
              setGameState(prev => {
                  const updatedMe = prev.users.map(u => u.id === newUser.id ? { ...u, isHost: true } : u);
                  return { ...prev, users: updatedMe };
              });
          } else {
              // Just in case, ask for sync again if users exist but I don't have full state
              socketService.send({
                type: 'SYNC_REQUEST',
                roomId: roomIdToJoin,
                payload: {},
                senderId: newUser.id
              });
          }
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Connection failed.');
    } finally {
      setIsConnecting(false);
    }
  };

  const exitRoom = () => {
      socketService.disconnect();
      setGameState({
        roomId: null,
        users: [],
        votes: {},
        tasks: [],
        currentTaskId: null,
        isRevealed: false,
      });
      setCurrentUser(null);
      setRoomInput('');
  };

  const submitVote = (value: string | number) => {
    if (!currentUser || !gameState.roomId) return;
    socketService.send({
        type: 'VOTE',
        roomId: gameState.roomId,
        senderId: currentUser.id,
        payload: { userId: currentUser.id, value }
    });
  };

  const revealVotes = () => {
      if (!currentUser?.isHost || !gameState.roomId) return;
      socketService.send({
          type: 'REVEAL',
          roomId: gameState.roomId,
          senderId: currentUser.id,
          payload: {}
      });
  };

  const resetRound = () => {
      if (!currentUser?.isHost || !gameState.roomId) return;
      socketService.send({
          type: 'RESET',
          roomId: gameState.roomId,
          senderId: currentUser.id,
          payload: {}
      });
  };

  const addTask = (title: string) => {
      if (!currentUser?.isHost || !gameState.roomId) return;
      const newTask: Task = { id: uuid(), title, status: 'pending' };
      socketService.send({
          type: 'ADD_TASK',
          roomId: gameState.roomId,
          senderId: currentUser.id,
          payload: newTask
      });
  };

  const deleteTask = (taskId: string) => {
      if (!currentUser?.isHost || !gameState.roomId) return;
      socketService.send({
          type: 'DELETE_TASK',
          roomId: gameState.roomId,
          senderId: currentUser.id,
          payload: taskId
      });
  }

  const updateTask = (taskId: string, title: string) => {
      if (!currentUser?.isHost || !gameState.roomId) return;
      socketService.send({
          type: 'UPDATE_TASK',
          roomId: gameState.roomId,
          senderId: currentUser.id,
          payload: { id: taskId, title }
      });
  }

  const selectTask = (taskId: string) => {
      if (!currentUser?.isHost || !gameState.roomId) return;
      socketService.send({
          type: 'SELECT_TASK',
          roomId: gameState.roomId,
          senderId: currentUser.id,
          payload: taskId
      });
  };

  const promoteUser = (userId: string) => {
      if (!currentUser?.isHost || !gameState.roomId) return;
      socketService.send({
          type: 'PROMOTE_USER',
          roomId: gameState.roomId,
          senderId: currentUser.id,
          payload: { targetUserId: userId }
      });
  };

  const copyRoomCode = () => {
      if(gameState.roomId) {
          navigator.clipboard.writeText(gameState.roomId);
      }
  };


  // RENDER: Login Screen
  if (!gameState.roomId || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse-slow"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl animate-pulse-slow" style={{animationDelay: '1s'}}></div>
        </div>

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 relative z-10">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-indigo-500/10 rounded-xl">
                <Users className="w-8 h-8 text-indigo-500" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center text-white mb-2">AgileVote</h1>
          <p className="text-slate-400 text-center mb-8">Planning Poker Online</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Your Name</label>
              <input 
                type="text" 
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={isConnecting}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition disabled:opacity-50"
                placeholder="e.g. John Doe"
              />
            </div>

            {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center animate-in fade-in slide-in-from-top-2">
                    {errorMsg}
                </div>
            )}

            <div className="pt-4 border-t border-slate-800">
               <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={createRoom}
                    disabled={!userName || isConnecting}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-700 hover:border-indigo-500 hover:bg-slate-800 transition-all group disabled:opacity-50 disabled:cursor-not-allowed relative"
                  >
                    {isConnecting && !roomInput ? (
                        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                    ) : (
                        <>
                            <span className="text-lg font-bold text-white mb-1 group-hover:text-indigo-400">Create Room</span>
                            <span className="text-xs text-slate-500">Host New</span>
                        </>
                    )}
                  </button>

                  <div className="space-y-2">
                    <input 
                        type="text" 
                        value={roomInput}
                        onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                        maxLength={6}
                        disabled={isConnecting}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-center text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase tracking-widest disabled:opacity-50"
                        placeholder="CODE"
                    />
                    <button 
                        onClick={joinRoom}
                        disabled={!userName || !roomInput || isConnecting}
                        className="w-full bg-slate-800 hover:bg-indigo-600 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isConnecting && roomInput ? (
                             <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>Join <ArrowRight className="w-4 h-4" /></>
                        )}
                    </button>
                  </div>
               </div>
            </div>
            
            <div className="text-center mt-4">
                <p className="text-[10px] text-slate-600">
                    Connected to Railway Server
                </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: Game Room
  const activeTask = gameState.tasks.find(t => t.id === gameState.currentTaskId);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
        {/* Mobile Sidebar Toggle */}
        <button 
            className="md:hidden absolute top-4 left-4 z-50 p-2 bg-slate-800 rounded-md text-white border border-slate-700"
            onClick={() => setShowSidebar(!showSidebar)}
        >
            {showSidebar ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        {/* Sidebar (Task List) */}
        <div className={`
            fixed md:relative z-40 h-full transition-transform duration-300 transform 
            ${showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
            <TaskList 
                tasks={gameState.tasks} 
                currentTaskId={gameState.currentTaskId} 
                isHost={currentUser.isHost}
                onAddTask={addTask}
                onDeleteTask={deleteTask}
                onUpdateTask={updateTask}
                onSelectTask={selectTask}
            />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950">
                <div className="flex items-center gap-4 ml-10 md:ml-0">
                   <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                       <span className="text-slate-400 text-xs font-semibold tracking-wider">ROOM</span>
                       <span className="text-white font-mono font-bold tracking-widest">{gameState.roomId}</span>
                       <button onClick={copyRoomCode} className="text-slate-500 hover:text-white transition-colors ml-1" title="Copy Code">
                           <Copy className="w-3.5 h-3.5" />
                       </button>
                   </div>
                </div>
                
                <div className="flex items-center gap-3">
                   <div className="flex flex-col items-end hidden md:flex">
                       <span className="text-white font-medium text-sm">{currentUser.name}</span>
                       <span className="text-xs text-slate-500 text-right">Online {currentUser.isHost && '(Host)'}</span>
                   </div>
                   <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-xs relative">
                       {currentUser.name.substring(0, 2).toUpperCase()}
                       {currentUser.isHost && (
                           <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-0.5 border border-slate-900">
                             <div className="w-1.5 h-1.5 bg-yellow-900 rounded-full" />
                           </div>
                       )}
                   </div>
                   <button 
                        onClick={exitRoom}
                        className="ml-2 p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-full transition-colors"
                        title="Exit Room"
                   >
                       <LogOut className="w-4 h-4" />
                   </button>
                </div>
            </header>

            {/* Game Area */}
            <main className="flex-1 relative flex flex-col">
                {/* Active Task Banner */}
                <div className="bg-slate-900/50 border-b border-slate-800 p-4 text-center">
                    {activeTask ? (
                        <>
                            <h2 className="text-slate-400 text-xs uppercase tracking-widest mb-1">Voting On</h2>
                            <h3 className="text-xl md:text-2xl font-bold text-white max-w-2xl mx-auto truncate">
                                {activeTask.title}
                            </h3>
                        </>
                    ) : (
                        <div className="text-slate-500 italic">No task selected. {currentUser.isHost && "Select one from the sidebar."}</div>
                    )}
                </div>

                {/* Poker Table */}
                <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                     <Table 
                        gameState={gameState} 
                        currentUser={currentUser}
                        onReveal={revealVotes}
                        onReset={resetRound}
                        onPromote={promoteUser}
                     />
                </div>

                {/* Hand / Cards */}
                <div className="bg-slate-900 border-t border-slate-800 p-6 z-10">
                    <div className="flex justify-center gap-2 md:gap-4 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                        {FIBONACCI_SEQ.map((val) => (
                            <Card 
                                key={val} 
                                value={val} 
                                selected={gameState.votes[currentUser.id] === val}
                                onClick={() => submitVote(val)}
                                disabled={gameState.isRevealed || !activeTask}
                            />
                        ))}
                    </div>
                </div>
            </main>
        </div>
    </div>
  );
}

export default App;