import { initializeApp, FirebaseApp } from "firebase/app";
import {
  getDatabase,
  Database,
  ref,
  set,
  onValue,
  remove,
  update,
  Unsubscribe,
  get,
  child,
  onDisconnect,
} from "firebase/database";
import { NetworkMessage, FIBONACCI_SEQ, Task } from "../types";

// Helper for finding closest Fibonacci
const getClosestFibonacci = (num: number): string | number => {
  // Filter numeric values from the sequence
  const fibNums = FIBONACCI_SEQ.map((v) => parseInt(v)).filter(
    (n) => !isNaN(n),
  );

  // Find closest
  const closest = fibNums.reduce((prev, curr) => {
    return Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev;
  });

  return closest;
};

/**
 * Firebase Realtime Database Service
 * Maintains the same interface as SocketService for easy migration
 */
class FirebaseService {
  private app: FirebaseApp | null = null;
  private db: Database | null = null;
  private listeners: ((message: NetworkMessage) => void)[] = [];
  public isConnected: boolean = false;
  private unsubscribes: Unsubscribe[] = [];
  private currentRoomId: string | null = null;

  constructor(firebaseConfig: any) {
    try {
      // Validate required config values
      const requiredKeys = [
        "apiKey",
        "projectId",
        "authDomain",
        "appId",
        "databaseURL",
      ];
      const missingKeys = requiredKeys.filter((key) => !firebaseConfig[key]);

      if (missingKeys.length > 0) {
        throw new Error(
          `[Firebase] Missing configuration keys: ${missingKeys.join(", ")}. Check your .env file.`,
        );
      }

      console.log("[Firebase] Config received:", {
        projectId: firebaseConfig.projectId,
        databaseURL: firebaseConfig.databaseURL,
      });

      this.app = initializeApp(firebaseConfig);
      this.db = getDatabase(this.app);
      this.isConnected = true; // Firebase connects automatically
      console.log("[Firebase] Service initialized successfully");
    } catch (e) {
      console.error("[Firebase] Initialization failed:", e);
      this.isConnected = false;
      throw e;
    }
  }

  /**
   * Connect to a room (similar to WebSocket connect)
   * roomId is used instead of serverUrl
   */
  public async connect(roomId: string): Promise<boolean> {
    try {
      if (!this.db) {
        throw new Error(
          "[Firebase] Database not initialized. Check your configuration.",
        );
      }

      this.currentRoomId = roomId;
      console.log(`[Firebase] Connecting to room: ${roomId}`);

      // Create room ref if it doesn't exist
      const roomRef = ref(this.db, `rooms/${roomId}`);

      // Check if room already exists
      const snapshot = await get(roomRef);
      if (!snapshot.exists()) {
        try {
          console.log(`[Firebase] Writing initial room data...`);
          await set(roomRef, {
            createdAt: new Date().toISOString(),
            users: {},
            votes: {},
            tasks: [],
            currentTaskId: null,
            isRevealed: false,
          });
          console.log(`[Firebase] ✅ Room created successfully: ${roomId}`);
        } catch (setError: any) {
          console.error("[Firebase] ❌ ERROR Writing to database:", setError);
          console.error("[Firebase] Error code:", setError.code);
          console.error("[Firebase] Error message:", setError.message);
          console.error(
            "[Firebase] ⚠️ This usually means Security Rules are blocking access.",
          );
          console.error(
            "[Firebase] Go to Firebase Console → Realtime Database → Rules",
          );
          console.error(
            "[Firebase] And set:",
            JSON.stringify({
              rules: { rooms: { $roomId: { ".read": true, ".write": true } } },
            }),
          );
          throw new Error(
            `Firebase write failed: ${setError.message}. Check Security Rules in Firebase Console > Realtime Database > Rules.`,
          );
        }
      } else {
        console.log(`[Firebase] ✅ Connected to existing room: ${roomId}`);
      }

      // Subscribe to room changes
      this.subscribeToRoom(roomId);

      return true;
    } catch (e: any) {
      console.error("[Firebase] ❌ Connection failed:", e.message);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Subscribe to all changes in the room
   * Syncs complete room state to listeners
   */
  private subscribeToRoom(roomId: string) {
    const roomRef = ref(this.db!, `rooms/${roomId}`);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      console.log(`[Firebase] Room data changed:`, {
        users: Object.keys(data.users || {}).length,
        votes: Object.keys(data.votes || {}).length,
      });

      // Send the complete state update as a SYNC_RESPONSE
      const syncMsg: NetworkMessage = {
        type: "SYNC_RESPONSE",
        roomId,
        senderId: "DATABASE",
        payload: {
          roomId,
          users: Object.values(data.users || {}), // Convert object to array
          votes: data.votes || {},
          tasks: Array.isArray(data.tasks)
            ? data.tasks
            : Object.values(data.tasks || {}), // Handle both formats
          currentTaskId: data.currentTaskId || null,
          isRevealed: data.isRevealed || false,
        },
      };

      console.log(
        `[Firebase] Broadcasting SYNC_RESPONSE with ${Object.keys(data.users || {}).length} users`
      );
      this.notifyListeners(syncMsg);
    });

    this.unsubscribes.push(unsubscribe);
  }

  /**
   * Send a message/update to Firebase
   * Converts NetworkMessage to Firebase updates
   */
  public async send(message: NetworkMessage) {
    if (!this.db || !this.currentRoomId) {
      console.warn("[Firebase] Not connected to a room");
      return;
    }

    try {
      console.log(`[Firebase] Sending message:`, message.type);
      const roomRef = ref(this.db, `rooms/${this.currentRoomId}`);

      switch (message.type) {
        case "JOIN": {
          const user = message.payload;
          console.log(`[Firebase] JOIN: Adding user ${user.id}...`);
          const userRef = ref(this.db, `rooms/${this.currentRoomId}/users/${user.id}`);
          await set(userRef, user);
          
          // Auto remove user on disconnect
          await onDisconnect(userRef).remove();
          console.log(`[Firebase] JOIN: User added successfully with onDisconnect handler`);
          break;
        }

        case "VOTE": {
          const { userId, value } = message.payload;
          console.log(`[Firebase] VOTE: User ${userId} voted ${value}`);
          await set(
            ref(this.db, `rooms/${this.currentRoomId}/votes/${userId}`),
            value,
          );
          break;
        }

        case "REVEAL": {
          console.log(`[Firebase] REVEAL: Revealing votes...`);
          await update(ref(this.db, `rooms/${this.currentRoomId}`), {
            isRevealed: true,
          });
          break;
        }

        case "RESET": {
          console.log(`[Firebase] RESET: Resetting round...`);
          const snapshot = await get(roomRef);
          const data = snapshot.val();
          
          if (data) {
            let updatedTasks = data.tasks || [];
            
            if (data.currentTaskId) {
              const votes = Object.values(data.votes || {}) as (string | number)[];
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

              // Update the tasks list in place (handle both array and map formats)
              if (Array.isArray(updatedTasks)) {
                updatedTasks = updatedTasks.map((t) =>
                  t.id === data.currentTaskId
                    ? { ...t, status: "completed", finalScore: finalScore }
                    : t,
                );
              } else {
                const taskKey = data.currentTaskId;
                if (updatedTasks[taskKey]) {
                  updatedTasks[taskKey] = {
                    ...updatedTasks[taskKey],
                    status: "completed",
                    finalScore: finalScore,
                  };
                }
              }
            }

            await update(roomRef, {
              votes: {},
              isRevealed: false,
              tasks: updatedTasks,
              currentTaskId: null,
            });
          }
          break;
        }

        case "ADD_TASK": {
          const task = message.payload;
          console.log(`[Firebase] ADD_TASK: Adding task ${task.id}`);
          await set(
            ref(this.db, `rooms/${this.currentRoomId}/tasks/${task.id}`),
            task,
          );
          break;
        }

        case "DELETE_TASK": {
          const taskId = message.payload;
          console.log(`[Firebase] DELETE_TASK: Deleting task ${taskId}`);
          await remove(
            ref(this.db, `rooms/${this.currentRoomId}/tasks/${taskId}`),
          );
          
          // Clear currentTaskId if it matches the deleted task
          const snapshot = await get(ref(this.db, `rooms/${this.currentRoomId}/currentTaskId`));
          if (snapshot.val() === taskId) {
            await set(ref(this.db, `rooms/${this.currentRoomId}/currentTaskId`), null);
          }
          break;
        }

        case "UPDATE_TASK": {
          const { id, title } = message.payload;
          console.log(`[Firebase] UPDATE_TASK: Updating task ${id}`);
          await update(
            ref(this.db, `rooms/${this.currentRoomId}/tasks/${id}`),
            { title },
          );
          break;
        }

        case "SELECT_TASK": {
          const taskId = message.payload;
          console.log(`[Firebase] SELECT_TASK: Selecting task ${taskId}`);
          await update(ref(this.db, `rooms/${this.currentRoomId}`), {
            currentTaskId: taskId,
            votes: {},
            isRevealed: false,
          });
          break;
        }

        case "PROMOTE_USER": {
          const { targetUserId } = message.payload;
          const senderId = message.senderId;
          console.log(`[Firebase] PROMOTE_USER: Promoting user ${targetUserId}`);
          
          await update(ref(this.db, `rooms/${this.currentRoomId}/users/${targetUserId}`), {
            isHost: true,
          });
          if (senderId && senderId !== targetUserId) {
            await update(ref(this.db, `rooms/${this.currentRoomId}/users/${senderId}`), {
              isHost: false,
            });
          }
          break;
        }

        case "USER_LEFT": {
          const userId = message.payload.id || message.payload;
          console.log(`[Firebase] USER_LEFT: User ${userId} leaving...`);
          await remove(
            ref(this.db, `rooms/${this.currentRoomId}/users/${userId}`),
          );
          break;
        }

        default:
          console.warn("[Firebase] Local broadcast for fallback type:", message.type);
      }

      console.log(`[Firebase] Message sent successfully:`, message.type);
      // Keep local listener notification for messages not backed by DB logic
      this.notifyListeners(message);
    } catch (e: any) {
      console.error("[Firebase] Failed to send message:", e);
    }
  }

  /**
   * Subscribe to messages (same interface as WebSocket)
   */
  public subscribe(callback: (message: NetworkMessage) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Notify all listeners of a message
   */
  private notifyListeners(message: NetworkMessage) {
    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (e) {
        console.error("[Firebase] Error in listener:", e);
      }
    });
  }

  /**
   * Disconnect from room
   */
  public disconnect() {
    console.log("[Firebase] Disconnecting from room");
    this.unsubscribes.forEach((unsub) => unsub());
    this.unsubscribes = [];
    this.currentRoomId = null;
    this.isConnected = false;
  }

  /**
   * Get current room data (useful for syncing new users)
   */
  public async getRoomState() {
    if (!this.db || !this.currentRoomId) return null;

    try {
      const roomRef = ref(this.db, `rooms/${this.currentRoomId}`);
      const snapshot = await get(roomRef);
      return snapshot.val();
    } catch (e) {
      console.error("[Firebase] Failed to get room state:", e);
      return null;
    }
  }
}

// Singleton instance
let firebaseService: FirebaseService | null = null;

export const initializeFirebaseService = (firebaseConfig: any) => {
  if (!firebaseService) {
    firebaseService = new FirebaseService(firebaseConfig);
  }
  return firebaseService;
};

export const getFirebaseService = (): FirebaseService | null => {
  return firebaseService;
};

