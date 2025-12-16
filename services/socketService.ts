import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import { NetworkMessage } from '../types';

/**
 * SocketService now uses PeerJS (WebRTC) to enable true online multiplayer
 * without a dedicated backend server.
 * 
 * - HOST: Creates a Peer with the Room ID. Acts as the "Server".
 * - CLIENT: Creates a random Peer, connects to Host Peer (Room ID).
 */
class SocketService {
  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null;
  private clientConns: Map<string, DataConnection> = new Map();
  private listeners: ((message: NetworkMessage) => void)[] = [];
  
  // Track if we are the host to determine message routing logic
  private isHostUser: boolean = false;

  constructor() {}

  /**
   * Initialize as HOST.
   * Tries to claim the roomId on the PeerJS signaling server.
   */
  public async createRoom(roomId: string): Promise<boolean> {
    this.isHostUser = true;
    
    return new Promise((resolve, reject) => {
      try {
        // Attempt to create peer with the specific roomId
        this.peer = new Peer(roomId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log('Host Peer ID:', id);
          resolve(true);
        });

        this.peer.on('error', (err: any) => {
          console.error('Peer error:', err);
          if (err.type === 'unavailable-id') {
            reject(new Error('Room ID is taken. Please try another code.'));
          } else {
            reject(err);
          }
        });

        this.peer.on('connection', (conn) => {
          this.handleIncomingConnection(conn);
        });

      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Initialize as CLIENT.
   * Connects to the host's roomId.
   */
  public async joinRoom(roomId: string): Promise<boolean> {
    this.isHostUser = false;

    return new Promise((resolve, reject) => {
      try {
        // Client gets a random ID
        this.peer = new Peer(undefined, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log('Client Peer ID:', id);
          if (!this.peer) return;

          // Connect to Host
          const conn = this.peer.connect(roomId, { reliable: true });

          conn.on('open', () => {
            console.log('Connected to Host:', roomId);
            this.hostConn = conn;
            this.setupDataListener(conn);
            resolve(true);
          });

          conn.on('error', (err) => {
            console.error('Connection error:', err);
            reject(err);
          });
          
          // If connection doesn't open in 5s, timeout
          setTimeout(() => {
            if (!conn.open) {
                reject(new Error('Connection timed out. Room might not exist.'));
            }
          }, 5000);
        });

        this.peer.on('error', (err) => {
          reject(err);
        });

      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Send a message to the network.
   */
  public send(message: NetworkMessage) {
    // 1. Process locally (optimistic UI)
    this.notifyListeners(message);

    // 2. Route message based on role
    if (this.isHostUser) {
      // I am Host: Broadcast to all clients
      this.broadcastToClients(message);
    } else {
      // I am Client: Send to Host
      if (this.hostConn && this.hostConn.open) {
        this.hostConn.send(message);
      }
    }
  }

  public subscribe(callback: (message: NetworkMessage) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  // --- Private Helpers ---

  private notifyListeners(message: NetworkMessage) {
    this.listeners.forEach(listener => listener(message));
  }

  private handleIncomingConnection(conn: DataConnection) {
    console.log('Host: New connection from', conn.peer);
    
    conn.on('open', () => {
      this.clientConns.set(conn.peer, conn);
    });

    conn.on('close', () => {
      this.clientConns.delete(conn.peer);
      // Optional: Notify app that a user left? 
      // For now, we don't have a specific LEAVE message protocol, 
      // but the app could implement it if needed.
    });

    conn.on('error', (err) => {
        console.error('Connection error', err);
        this.clientConns.delete(conn.peer);
    });

    this.setupDataListener(conn);
  }

  private setupDataListener(conn: DataConnection) {
    conn.on('data', (data: any) => {
      const message = data as NetworkMessage;
      
      // 1. Update self
      this.notifyListeners(message);

      // 2. If I am Host, I need to relay this message to everyone else (Star topology)
      if (this.isHostUser) {
        // Broadcast to all clients (including the sender? No, sender has local update. 
        // But to be safe and consistent with React state, sending back is fine, 
        // though our App.tsx handles local optimistic update for VOTE. 
        // Let's send to everyone EXCEPT sender to avoid double processing if not idempotent 
        // (though reducers usually are).
        // Actually, for simplicity and consistency, let's just broadcast to everyone else.
        this.broadcastToClients(message, conn.peer);
      }
    });
  }

  private broadcastToClients(message: NetworkMessage, excludePeerId?: string) {
    this.clientConns.forEach((conn, peerId) => {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(message);
      }
    });
  }
}

export const socketService = new SocketService();