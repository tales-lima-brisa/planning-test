import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  LogIn,
  ArrowRight,
  ClipboardList,
  Copy,
  Link as LinkIcon,
  Menu,
  X,
  Loader2,
  LogOut,
  Server,
  Eye,
  Check,
  Share2,
} from "lucide-react";
import {
  initializeFirebaseService,
  getFirebaseService,
} from "./services/firebaseService";
import firebaseConfig from "./firebaseConfig";
import { GameState, User, NetworkMessage, FIBONACCI_SEQ, Task } from "./types";
import { Card } from "./components/Card";
import { Table } from "./components/Table";
import { TaskList } from "./components/TaskList";

// Helper to convert Firebase object to array
const objectToArray = (obj: any): any[] => {
  if (Array.isArray(obj)) return obj;
  if (!obj) return [];
  return Object.values(obj);
};

// Helper to generate IDs
const uuid = () => Math.random().toString(36).substring(2, 9);

// Helper for finding closest Fibonacci
const getClosestFibonacci = (num: number): string | number => {
  // Filter numeric values from the sequensce
  const fibNums = FIBONACCI_SEQ.map((v) => parseInt(v)).filter(
    (n) => !isNaN(n),
  );

  // Find closest
  const closest = fibNums.reduce((prev, curr) => {
    return Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev;
  });

  return closest;
};

function changeUrl(code: string) {
  window.history.pushState({}, "", `/${code}`);
}

function App() {
  // Local UI State
  const [userName, setUserName] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [isObserver, setIsObserver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);

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
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Handle incoming network messages
  const handleMessage = useCallback((msg: NetworkMessage) => {
    // Guard: Ignore messages if we aren't in a room yet (unless it's a join ack/local echo)
    if (
      gameStateRef.current.roomId &&
      msg.roomId !== gameStateRef.current.roomId
    )
      return;

    switch (msg.type) {
      case "JOIN": {
        const newUser = msg.payload;
        console.log("[App] User Joined:", newUser.name);

        setGameState((prev) => {
          if (prev.users.some((u) => u.id === newUser.id)) return prev;
          return { ...prev, users: [...prev.users, newUser] };
        });

        // Host Logic: Sync State to New User
        if (
          currentUserRef.current?.isHost &&
          newUser.id !== currentUserRef.current.id
        ) {
          const currentUsers = gameStateRef.current.users;
          const updatedUsers = currentUsers.some((u) => u.id === newUser.id)
            ? currentUsers
            : [...currentUsers, newUser];

          const statePayload = {
            ...gameStateRef.current,
            users: updatedUsers,
          };

          const firebaseService = getFirebaseService();
          firebaseService?.send({
            type: "SYNC_RESPONSE",
            roomId: msg.roomId,
            senderId: currentUserRef.current.id,
            payload: statePayload,
          });
        }
        break;
      }

      case "USER_LEFT": {
        const leftUserId = msg.payload.id;
        console.log("[App] User Left:", leftUserId);

        setGameState((prev) => {
          const currentUsers = objectToArray(prev.users);
          const leavingUser = currentUsers.find((u) => u.id === leftUserId);

          // Filtra quem saiu
          const remainingUsers = currentUsers.filter(
            (u) => u.id !== leftUserId,
          );

          let updatedUsers = remainingUsers;

          // Se quem saiu era o Host e ainda tem gente na sala
          if (leavingUser?.isHost && remainingUsers.length > 0) {
            console.log("[App] Host left. Executing succession logic...");

            // DETERMINISMO: Ordenamos os usuários restantes pelo ID (ou outra propriedade estável)
            // para garantir que TODOS os computadores da sala elejam exatamente a mesma pessoa.
            const sortedUsers = [...remainingUsers].sort((a, b) =>
              a.id.localeCompare(b.id),
            );
            const nextHostId = sortedUsers[0].id;

            // Mapeia a lista aplicando o novo host
            updatedUsers = remainingUsers.map((u) =>
              u.id === nextHostId ? { ...u, isHost: true } : u,
            );

            // VERIFICAÇÃO: Eu fui o escolhido pela sucessão?
            if (nextHostId === currentUserRef.current?.id) {
              console.log(
                "[App] I am the chosen successor! Notifying database...",
              );

              // 1. Atualiza o currentUser local imediatamente
              setCurrentUser((prevUser) =>
                prevUser ? { ...prevUser, isHost: true } : null,
              );

              // 2. Grava no Firebase para persistir a decisão para a sala inteira
              const firebaseService = getFirebaseService();
              if (firebaseService) {
                const db = (firebaseService as any).db;
                if (db) {
                  // Import dinâmico para atualizar o banco de dados de forma assíncrona
                  import("firebase/database").then(({ ref, update }) => {
                    update(
                      ref(
                        db,
                        `rooms/${gameStateRef.current.roomId}/users/${nextHostId}`,
                      ),
                      {
                        isHost: true,
                      },
                    ).catch((err) =>
                      console.error("Error writing new host to DB:", err),
                    );
                  });
                }
              }
            }
          }

          return {
            ...prev,
            users: updatedUsers,
            votes: Object.fromEntries(
              Object.entries(prev.votes || {}).filter(
                ([uid]) => uid !== leftUserId,
              ),
            ),
          };
        });
        break;
      }

      case "PROMOTE_USER": {
        const targetUserId = msg.payload.targetUserId;
        setGameState((prev) => {
          const updatedUsers = prev.users.map((u) => ({
            ...u,
            isHost: u.id === targetUserId,
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

      case "SYNC_REQUEST":
        if (currentUserRef.current?.isHost) {
          const firebaseService = getFirebaseService();
          firebaseService?.send({
            type: "SYNC_RESPONSE",
            roomId: msg.roomId,
            senderId: currentUserRef.current.id,
            payload: gameStateRef.current,
          });
        }
        break;

      case "SYNC_RESPONSE":
        console.log("[App] Received SYNC_RESPONSE, converting data...");
        const syncedUsers = objectToArray(msg.payload.users);
        const syncedTasks = objectToArray(msg.payload.tasks);
        console.log(
          "[App] SYNC tasks raw type:",
          typeof msg.payload.tasks,
          "isArray:",
          Array.isArray(msg.payload.tasks),
          "converted length:",
          syncedTasks.length,
        );
        const syncedState = {
          ...msg.payload,
          users: syncedUsers,
          tasks: syncedTasks,
        };
        setGameState(syncedState);

        // Ensure my currentUser isHost and isObserver flags are consistent with the synced state
        // If I am in the user list, sync my status
        const meInState = syncedUsers.find(
          (u: User) => u.id === currentUserRef.current?.id,
        );
        if (meInState && currentUserRef.current) {
          const needsHostSync =
            meInState.isHost !== currentUserRef.current.isHost;
          const needsObserverSync =
            meInState.isObserver !== currentUserRef.current.isObserver;
          if (needsHostSync || needsObserverSync) {
            console.log(
              "[App] Syncing user status. Host:",
              meInState.isHost,
              "Observer:",
              meInState.isObserver,
            );
            setCurrentUser({
              ...currentUserRef.current,
              isHost: meInState.isHost,
              isObserver: meInState.isObserver,
            });
          }
        }
        break;

      case "VOTE":
        setGameState((prev) => ({
          ...prev,
          votes: { ...prev.votes, [msg.payload.userId]: msg.payload.value },
        }));
        break;

      case "REVEAL":
        setGameState((prev) => ({ ...prev, isRevealed: true }));
        break;

      case "RESET":
        setGameState((prev) => {
          let updatedTasks = [...prev.tasks];
          if (prev.currentTaskId) {
            const votes = Object.values(prev.votes) as (string | number)[];

            // FEATURE 6: Closest Fibonacci to Average
            let finalScore: string | number | undefined;

            if (votes.length > 0) {
              const numericVotes = votes
                .map((v) => Number(v))
                .filter((n) => !isNaN(n));

              if (numericVotes.length > 0) {
                const sum = numericVotes.reduce((a, b) => a + b, 0);
                const avg = sum / numericVotes.length;
                finalScore = getClosestFibonacci(avg);
              } else {
                // Fallback for non-numeric (coffee, ?) - take most frequent
                finalScore = votes
                  .sort(
                    (a, b) =>
                      votes.filter((v) => v === a).length -
                      votes.filter((v) => v === b).length,
                  )
                  .pop() as string | number | undefined;
              }
            }

            updatedTasks = updatedTasks.map((t) =>
              t.id === prev.currentTaskId
                ? { ...t, status: "completed", finalScore: finalScore }
                : t,
            );
          }

          return {
            ...prev,
            isRevealed: false,
            votes: {},
            tasks: updatedTasks,
            currentTaskId: null,
          };
        });
        break;

      case "ADD_TASK":
        setGameState((prev) => {
          if (prev.tasks.some((t) => t.id === msg.payload.id)) return prev;
          return {
            ...prev,
            tasks: [...prev.tasks, msg.payload],
          };
        });
        break;

      case "DELETE_TASK":
        setGameState((prev) => ({
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== msg.payload),
          currentTaskId:
            prev.currentTaskId === msg.payload ? null : prev.currentTaskId,
        }));
        break;

      case "UPDATE_TASK":
        setGameState((prev) => ({
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === msg.payload.id ? { ...t, title: msg.payload.title } : t,
          ),
        }));
        break;

      case "SELECT_TASK":
        setGameState((prev) => ({
          ...prev,
          currentTaskId: msg.payload,
          votes: {},
          isRevealed: false,
        }));
        break;
    }
  }, []); // Dependencies reduced since we use Ref
  useEffect(() => {
    const path = window.location.pathname.replace("/", "").trim().toUpperCase();

    // Verifica se o caminho parece um código de sala válido (ex: 5 ou 6 caracteres)
    if (path && path.length >= 5 && path.length <= 6) {
      setRoomInput(path);
    }
  }, []);

  useEffect(() => {
    const firebaseService = getFirebaseService();
    const unsubscribe = firebaseService?.subscribe(handleMessage);
    return () => unsubscribe?.();
  }, [handleMessage]);

  // Initialize Firebase on mount
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    try {
      // 1. Inicializa o serviço primeiro
      const firebaseService = initializeFirebaseService(firebaseConfig);
      console.log("[App] Firebase initialized successfully");
      setIsFirebaseReady(true);

      // 2. Agora sim, com o serviço garantido, fazemos o subscribe
      unsubscribe = firebaseService.subscribe(handleMessage);
    } catch (err: any) {
      console.error("[App] Firebase initialization failed:", err);
      setErrorMsg(
        err.message ||
          "Firebase configuration error. Check console and .env file.",
      );
      setIsFirebaseReady(false);
    }

    // Cleanup na desmontagem do componente
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [handleMessage]);

  // Actions
  const createRoom = async () => {
    if (!userName.trim() || !isFirebaseReady) return;
    setIsConnecting(true);
    setErrorMsg(null);

    const newRoomId = uuid().substring(0, 5).toUpperCase();
    const newUser: User = {
      id: uuid(),
      name: userName,
      isHost: true,
      isObserver: isObserver,
    };

    try {
      const firebaseService = getFirebaseService();
      if (!firebaseService) {
        throw new Error("Firebase service not initialized");
      }

      console.log("[App] Creating room:", newRoomId);
      const connected = await firebaseService.connect(newRoomId);

      if (!connected) {
        throw new Error("Failed to connect to Firebase room");
      }

      console.log("[App] Connected to room. Updating state...");

      // Update user first
      setCurrentUser(newUser);

      const initialTasks: Task[] = [
        { id: uuid(), title: "First User Story", status: "active" },
      ];

      const initialState: GameState = {
        roomId: newRoomId,
        users: [newUser],
        votes: {},
        tasks: initialTasks,
        currentTaskId: initialTasks[0].id,
        isRevealed: false,
      };

      setGameState(initialState);
      console.log("[App] State updated. Room ready:", newRoomId);

      //change room URL
      changeUrl(newRoomId);

      // Send JOIN message to Firebase
      await firebaseService.send({
        type: "JOIN",
        roomId: newRoomId,
        payload: newUser,
        senderId: newUser.id,
      });

      console.log("[App] JOIN message sent");
    } catch (err: any) {
      console.error("[App] Error creating room:", err);
      setErrorMsg(err.message || "Connection failed.");
      setCurrentUser(null);
      setGameState({
        roomId: null,
        users: [],
        votes: {},
        tasks: [],
        currentTaskId: null,
        isRevealed: false,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const joinRoom = async () => {
    if (!userName.trim() || !roomInput.trim() || !isFirebaseReady) return;
    setIsConnecting(true);
    setErrorMsg(null);

    const roomIdToJoin = roomInput.toUpperCase();
    const newUser: User = {
      id: uuid(),
      name: userName,
      isHost: false,
      isObserver: isObserver,
    }; // Initially false

    try {
      const firebaseService = getFirebaseService();
      if (!firebaseService) {
        throw new Error("Firebase service not initialized");
      }

      console.log("[App] Joining room:", roomIdToJoin);
      const connected = await firebaseService.connect(roomIdToJoin);

      if (!connected) {
        throw new Error("Failed to connect to Firebase room");
      }

      console.log("[App] Connected to room. Updating state...");
      setCurrentUser(newUser);

      changeUrl(roomIdToJoin);

      // Temporarily set minimal state, waiting for sync
      setGameState((prev) => ({
        ...prev,
        roomId: roomIdToJoin,
        users: [newUser],
      }));

      await firebaseService.send({
        type: "JOIN",
        roomId: roomIdToJoin,
        payload: newUser,
        senderId: newUser.id,
      });

      console.log("[App] JOIN message sent. Waiting for sync...");

      // Check for empty room / Host auto-promotion
      // If we don't get a SYNC response in 1.5s, assume we are the first/only one
      setTimeout(async () => {
        const currentUsers = objectToArray(gameStateRef.current.users);

        // Se não recebemos sincronização e só tem nós na sala (ou ninguém)
        if (currentUsers.length <= 1) {
          console.log(
            "No sync received, assuming empty room. Becoming Host via DB.",
          );

          const firebaseService = getFirebaseService();
          if (!firebaseService) return;

          try {
            const db = (firebaseService as any).db;
            if (db) {
              const { ref, update } = await import("firebase/database");

              // 1. Atualiza primeiro no Firebase para garantir a persistência
              await update(
                ref(db, `rooms/${roomIdToJoin}/users/${newUser.id}`),
                {
                  isHost: true,
                },
              );

              // 2. Atualiza o estado local imediatamente para a UI responder rápido
              setCurrentUser((prev) =>
                prev ? { ...prev, isHost: true } : null,
              );
              setGameState((prev) => {
                const updatedMe = objectToArray(prev.users).map((u) =>
                  u.id === newUser.id ? { ...u, isHost: true } : u,
                );
                return { ...prev, users: updatedMe };
              });
            }
          } catch (err) {
            console.error("[App] Erro ao auto-promover host no Firebase:", err);
          }
        } else {
          // Caso existam usuários mas o estado não veio completo, força o pedido de sync
          const firebaseService = getFirebaseService();
          firebaseService?.send({
            type: "SYNC_REQUEST",
            roomId: roomIdToJoin,
            payload: {},
            senderId: newUser.id,
          });
        }
      }, 1500);
    } catch (err: any) {
      console.error("[App] Error joining room:", err);
      setErrorMsg(err.message || "Connection failed.");
      setCurrentUser(null);
      setGameState({
        roomId: null,
        users: [],
        votes: {},
        tasks: [],
        currentTaskId: null,
        isRevealed: false,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const exitRoom = () => {
    const firebaseService = getFirebaseService();
    if (currentUser && gameState.roomId) {
      firebaseService?.send({
        type: "USER_LEFT",
        roomId: gameState.roomId,
        senderId: currentUser.id,
        payload: { id: currentUser.id },
      });
    }
    firebaseService?.disconnect();
    setGameState({
      roomId: null,
      users: [],
      votes: {},
      tasks: [],
      currentTaskId: null,
      isRevealed: false,
    });
    setCurrentUser(null);
    setRoomInput("");
    changeUrl("");
  };

  const toggleObserverMode = async () => {
    if (!currentUser || !gameState.roomId) return;

    const newObserverStatus = !currentUser.isObserver;
    const firebaseService = getFirebaseService();
    if (!firebaseService) return;

    try {
      // 1. Update our local currentUser state so that we immediately reflect the change
      const updatedUser = { ...currentUser, isObserver: newObserverStatus };
      setCurrentUser(updatedUser);

      // 2. If transitioning to observer, clear our vote in the database
      if (newObserverStatus) {
        // Clear vote from Firebase under /rooms/{roomId}/votes/{userId}
        const db = (firebaseService as any).db;
        if (db) {
          const { ref, remove } = await import("firebase/database");
          await remove(
            ref(db, `rooms/${gameState.roomId}/votes/${currentUser.id}`),
          );
        }
      }

      // 3. Update the user object in Firebase under /rooms/{roomId}/users/{userId}
      const db = (firebaseService as any).db;
      if (db) {
        const { ref, update } = await import("firebase/database");
        await update(
          ref(db, `rooms/${gameState.roomId}/users/${currentUser.id}`),
          {
            isObserver: newObserverStatus,
          },
        );
      }

      console.log(
        `[App] Toggled observer mode. New status: ${newObserverStatus}`,
      );
    } catch (err) {
      console.error("[App] Error toggling observer mode:", err);
    }
  };

  const submitVote = (value: string | number) => {
    if (!currentUser || !gameState.roomId) return;
    const firebaseService = getFirebaseService();
    firebaseService?.send({
      type: "VOTE",
      roomId: gameState.roomId,
      senderId: currentUser.id,
      payload: { userId: currentUser.id, value },
    });
  };

  const revealVotes = () => {
    if (!currentUser?.isHost || !gameState.roomId) return;
    const firebaseService = getFirebaseService();
    firebaseService?.send({
      type: "REVEAL",
      roomId: gameState.roomId,
      senderId: currentUser.id,
      payload: {},
    });
  };

  const resetRound = () => {
    if (!currentUser?.isHost || !gameState.roomId) return;
    const firebaseService = getFirebaseService();
    firebaseService?.send({
      type: "RESET",
      roomId: gameState.roomId,
      senderId: currentUser.id,
      payload: {},
    });
  };

  const addTask = (title: string) => {
    if (!currentUser?.isHost || !gameState.roomId) return;
    const newTask: Task = { id: uuid(), title, status: "pending" };
    const firebaseService = getFirebaseService();
    firebaseService?.send({
      type: "ADD_TASK",
      roomId: gameState.roomId,
      senderId: currentUser.id,
      payload: newTask,
    });
  };

  const deleteTask = (taskId: string) => {
    if (!currentUser?.isHost || !gameState.roomId) return;
    const firebaseService = getFirebaseService();
    firebaseService?.send({
      type: "DELETE_TASK",
      roomId: gameState.roomId,
      senderId: currentUser.id,
      payload: taskId,
    });
  };

  const updateTask = (taskId: string, title: string) => {
    if (!currentUser?.isHost || !gameState.roomId) return;
    const firebaseService = getFirebaseService();
    firebaseService?.send({
      type: "UPDATE_TASK",
      roomId: gameState.roomId,
      senderId: currentUser.id,
      payload: { id: taskId, title },
    });
  };

  const selectTask = (taskId: string) => {
    if (!currentUser?.isHost || !gameState.roomId) return;
    const firebaseService = getFirebaseService();
    firebaseService?.send({
      type: "SELECT_TASK",
      roomId: gameState.roomId,
      senderId: currentUser.id,
      payload: taskId,
    });
  };

  const promoteUser = (userId: string) => {
    if (!currentUser?.isHost || !gameState.roomId) return;
    const firebaseService = getFirebaseService();
    firebaseService?.send({
      type: "PROMOTE_USER",
      roomId: gameState.roomId,
      senderId: currentUser.id,
      payload: { targetUserId: userId },
    });
  };

  const copyRoomCode = () => {
    if (!gameState.roomId) return;

    const textToCopy = gameState.roomId;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch((err) => {
          console.error("Failed to copy using navigator.clipboard:", err);
          fallbackCopy(textToCopy);
        });
    } else {
      fallbackCopy(textToCopy);
    }
  };

  const handleCopyRoomUrl = () => {
    const url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch((err) => {
          console.error("Failed to copy using navigator.clipboard:", err);
          fallbackCopy(url);
        });
    } else {
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed"; // avoid scrolling to bottom
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        alert("Não foi possível copiar automaticamente. Código: " + text);
      }
    } catch (err) {
      console.error("Fallback copy failed:", err);
      alert("Não foi possível copiar automaticamente. Código: " + text);
    }
  };

  const pasteRoomCode = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const cleanText = text.trim().toUpperCase().substring(0, 6);
          setRoomInput(cleanText);
        }
      } else {
        alert(
          "A leitura da área de transferência não é suportada neste navegador/contexto.",
        );
      }
    } catch (err) {
      console.error("Failed to read from clipboard:", err);
    }
  };

  const unlockRoomInput = () => {
    return roomInput.length === 5;
  };

  // RENDER: Login Screen
  if (!gameState.roomId || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse-slow"></div>
          <div
            className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl animate-pulse-slow"
            style={{ animationDelay: "1s" }}
          ></div>
        </div>

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 relative z-10">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-indigo-500/10 rounded-xl">
              <Users className="w-8 h-8 text-indigo-500" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center text-white mb-2">
            AgileVote
          </h1>
          <p className="text-slate-400 text-center mb-8">
            Planning Poker Online
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Your Name
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={isConnecting}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition disabled:opacity-50"
                placeholder="e.g. John Doe"
              />
            </div>

            <div className="flex items-center space-x-3 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 hover:border-slate-700/60 transition-all select-none">
              <input
                type="checkbox"
                id="isObserver"
                checked={isObserver}
                onChange={(e) => setIsObserver(e.target.checked)}
                disabled={isConnecting}
                className="w-4.5 h-4.5 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
              />
              <label
                htmlFor="isObserver"
                className="flex-1 text-sm text-slate-300 font-medium cursor-pointer"
              >
                Entrar como Observador
                <span className="block text-[10px] text-slate-500 font-normal">
                  Você não poderá votar, apenas assistir a votação.
                </span>
              </label>
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
                  disabled={!userName || isConnecting || !isFirebaseReady}
                  className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-700 hover:border-indigo-500 hover:bg-slate-800 transition-all group disabled:opacity-50 disabled:cursor-not-allowed relative"
                >
                  {isConnecting && !roomInput ? (
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                  ) : (
                    <>
                      <span className="text-lg font-bold text-white mb-1 group-hover:text-indigo-400">
                        Create Room
                      </span>
                      <span className="text-xs text-slate-500">Host New</span>
                    </>
                  )}
                </button>

                <div className="space-y-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={roomInput}
                      onChange={(e) =>
                        setRoomInput(e.target.value.toUpperCase())
                      }
                      maxLength={5}
                      minLength={5}
                      disabled={isConnecting}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-center text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase tracking-widest disabled:opacity-50 font-mono"
                      placeholder="CODE"
                    />
                    <button
                      type="button"
                      onClick={pasteRoomCode}
                      disabled={isConnecting}
                      className="absolute right-2 text-slate-500 hover:text-indigo-400 p-1 rounded transition-colors disabled:opacity-30"
                      title="Colar código"
                    >
                      <ClipboardList className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={joinRoom}
                    disabled={
                      !userName ||
                      !unlockRoomInput() ||
                      isConnecting ||
                      !isFirebaseReady
                    }
                    className="w-full bg-slate-800 hover:bg-indigo-600 text-white py-2 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isConnecting && unlockRoomInput() ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Join <ArrowRight className="w-4 h-4" />
                      </>
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
  const activeTask = gameState.tasks.find(
    (t) => t.id === gameState.currentTaskId,
  );

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
      <div
        className={`
            fixed md:relative z-40 h-full transition-transform duration-300 transform 
            ${
              showSidebar
                ? "translate-x-0"
                : "-translate-x-full md:translate-x-0"
            }
        `}
      >
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
              <span className="text-slate-400 text-xs font-semibold tracking-wider">
                ROOM
              </span>
              <span className="text-white font-mono font-bold tracking-widest">
                {gameState.roomId}
              </span>
              <button
                onClick={copyRoomCode}
                className={`transition-all duration-300 ml-1.5 p-1 rounded hover:bg-slate-800 ${
                  copied
                    ? "text-emerald-400"
                    : "text-slate-500 hover:text-white"
                }`}
                title={copied ? "Código copiado!" : "Copiar código"}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 animate-in fade-in zoom-in-50" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={handleCopyRoomUrl}
                className={`transition-all duration-300 ml-1.5 p-1 rounded hover:bg-slate-800 ${
                  copiedUrl
                    ? "text-emerald-400"
                    : "text-slate-500 hover:text-white"
                }`}
                title={copiedUrl ? "Link copiado!" : "Copiar Link da Sala"}
              >
                {copiedUrl ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 animate-in fade-in zoom-in-50" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end hidden md:flex">
              <span className="text-white font-medium text-sm">
                {currentUser.name}
              </span>
              <span className="text-xs text-slate-500 text-right">
                Online {currentUser.isHost && "(Host)"}
              </span>
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
                <h2 className="text-slate-400 text-xs uppercase tracking-widest mb-1">
                  Voting On
                </h2>
                <h3 className="text-xl md:text-2xl font-bold text-white max-w-2xl mx-auto truncate">
                  {activeTask.title}
                </h3>
              </>
            ) : (
              <div className="text-slate-500 italic">
                No task selected.{" "}
                {currentUser.isHost && "Select one from the sidebar."}
              </div>
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
          {currentUser.isObserver ? (
            <div className="bg-slate-900 border-t border-slate-800 p-6 z-10 flex flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Eye className="w-5 h-5 text-indigo-400 animate-pulse" />
                <span className="text-sm font-semibold">
                  Você está no modo Observador
                </span>
              </div>
              <p className="text-xs text-slate-500 text-center max-w-xs">
                Como observador, você não participa das votações, mas pode ver
                os votos em tempo real assim que revelados.
              </p>
              <button
                onClick={toggleObserverMode}
                className="mt-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-semibold transition border border-slate-700 hover:border-indigo-500 hover:text-indigo-400"
              >
                Mudar para Votante
              </button>
            </div>
          ) : (
            <div className="bg-slate-900 border-t border-slate-800 p-6 z-10 flex flex-col items-center gap-4">
              <div className="flex justify-center gap-2 md:gap-4 overflow-x-auto pb-2 md:pb-0 scrollbar-hide w-full max-w-2xl">
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
              <button
                onClick={toggleObserverMode}
                className="text-slate-500 hover:text-indigo-400 text-xs font-medium transition flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                Mudar para Observador
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
