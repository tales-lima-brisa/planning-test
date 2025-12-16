import React, { useState, useEffect, useCallback } from 'react';
import { Users, LogIn, ArrowRight, ClipboardList, Copy, Link as LinkIcon, Menu, X, Loader2 } from 'lucide-react';
import { socketService } from './services/socketService';
import { GameState, User, NetworkMessage, FIBONACCI_SEQ, Task } from './types';
import { Card } from './components/Card';
import { Table } from './components/Table';
import { TaskList } from './components/TaskList';

// Helper to generate IDs
const uuid = () => Math.random().toString(36).substring(2, 9);

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

  // Handle incoming network messages
  const handleMessage = useCallback((msg: NetworkMessage) => {
    // Only process messages for this room
    if (gameState.roomId && msg.roomId !== gameState.roomId && msg.type !== 'SYNC_RESPONSE') return;

    switch (msg.type) {
      case 'JOIN':
        setGameState(prev => {
          if (prev.users.some(u => u.id === msg.payload.id)) return prev;
          const newState = { ...prev, users: [...prev.users, msg.payload] };
          
          // If I am the host, I need to send the current full state to the new joiner
          if (currentUser?.isHost) {
             socketService.send({
               type: 'SYNC_RESPONSE',
               roomId: msg.roomId, // Send specifically to the room channel
               senderId: currentUser.id,
               payload: newState // Send the updated state
             });
          }
          return newState;
        });
        break;

      case 'SYNC_REQUEST':
        if (currentUser?.isHost) {
          socketService.send({
            type: 'SYNC_RESPONSE',
            roomId: msg.roomId,
            senderId: currentUser.id,
            payload: gameState
          });
        }
        break;

      case 'SYNC_RESPONSE':
        // Only accept sync if we are just joining or out of sync
        setGameState(msg.payload);
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
               // Calculate consensus score (most frequent)
               const votes = Object.values(prev.votes);
               const score = votes.sort((a,b) => 
                  votes.filter(v => v===a).length - votes.filter(v => v===b).length
               ).pop();

               updatedTasks = updatedTasks.map(t => 
                 t.id === prev.currentTaskId 
                   ? { ...t, status: 'completed', finalScore: score } 
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

      case 'SELECT_TASK':
        setGameState(prev => ({
          ...prev,
          currentTaskId: msg.payload,
          votes: {},
          isRevealed: false
        }));
        break;
    }
  }, [gameState, currentUser]);

  useEffect(() => {
    const unsubscribe = socketService.subscribe(handleMessage);
    return () => unsubscribe();
  }, [handleMessage]);

  // Actions
  const createRoom = async () => {
    if (!userName.trim()) return;
    setIsConnecting(true);
    setErrorMsg(null);

    const newRoomId = uuid().substring(0, 5).toUpperCase(); // Short code
    const newUser: User = { id: uuid(), name: userName, isHost: true };

    try {
      await socketService.createRoom(newRoomId);
      
      setCurrentUser(newUser);
      const initialTasks: Task[] = [{id: uuid(), title: 'First User Story', status: 'active'}];
      
      setGameState({
        roomId: newRoomId,
        users: [newUser],
        votes: {},
        tasks: initialTasks,
        currentTaskId: initialTasks[0].id,
        isRevealed: false
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create room. Try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const joinRoom = async () => {
    if (!userName.trim() || !roomInput.trim()) return;
    setIsConnecting(true);
    setErrorMsg(null);

    const roomIdToJoin = roomInput.toUpperCase();
    const newUser: User = { id: uuid(), name: userName, isHost: false };

    try {
      await socketService.joinRoom(roomIdToJoin);
      
      setCurrentUser(newUser);
      // Optimistically set room ID
      setGameState(prev => ({ ...prev, roomId: roomIdToJoin }));
      
      // Announce join
      socketService.send({
        type: 'JOIN',
        roomId: roomIdToJoin,
        payload: newUser,
        senderId: newUser.id
      });
      
      // Ask for current state
      socketService.send({
        type: 'SYNC_REQUEST',
        roomId: roomIdToJoin,
        payload: {},
        senderId: newUser.id
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to join room. Check the code.');
    } finally {
      setIsConnecting(false);
    }
  };

  const submitVote = (value: string | number) => {
    if (!currentUser || !gameState.roomId) return;
    // Update local immediately for responsiveness
    setGameState(prev => ({
        ...prev,
        votes: { ...prev.votes, [currentUser.id]: value }
    }));
    // Broadcast
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

  const selectTask = (taskId: string) => {
      if (!currentUser?.isHost || !gameState.roomId) return;
      socketService.send({
          type: 'SELECT_TASK',
          roomId: gameState.roomId,
          senderId: currentUser.id,
          payload: taskId
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
        {/* Background Accents */}
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
          <p className="text-slate-400 text-center mb-8">Synchronized Planning Poker for remote teams.</p>

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
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
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
                            <span className="text-xs text-slate-500">Start a new session</span>
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
            
            <div className="text-center mt-6">
                <p className="text-xs text-slate-600">
                   Uses PeerJS (WebRTC) for serverless P2P connection.
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
                       <button onClick={copyRoomCode} className="text-slate-500 hover:text-white transition-colors ml-1">
                           <Copy className="w-3.5 h-3.5" />
                       </button>
                   </div>
                </div>
                
                <div className="flex items-center gap-3">
                   <div className="flex flex-col items-end">
                       <span className="text-white font-medium text-sm">{currentUser.name}</span>
                       <span className="text-xs text-slate-500">{currentUser.isHost ? 'Host' : 'Member'}</span>
                   </div>
                   <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-xs">
                       {currentUser.name.substring(0, 2).toUpperCase()}
                   </div>
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