import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';
import { NetworkMessage } from '../types';

// Prefix to avoid collisions on the public PeerJS server
const APP_PREFIX = 'agilevote-prod-v1-';

/**
 * SocketService using PeerJS (WebRTC).
 * 
 * IMPROVEMENTS FOR VERCEL/ONLINE:
 * 1. Namespaced IDs: Room Code "ABC" becomes Peer ID "agilevote-prod-v1-ABC".
 * 2. Robust ICE Servers: Added multiple STUN servers to help connect across different networks (NAT).
 */
class SocketService {
  private peer: Peer | null = null;
  private hostConn: DataConnection | null = null;
  private clientConns: Map<string, DataConnection> = new Map();
  private listeners: ((message: NetworkMessage) => void)[] = [];
  
  private isHostUser: boolean = false;

  constructor() {}

  private getPeerConfig() {
    return {
      debug: 1, // 0: None, 1: Errors, 2: Warnings, 3: All
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ]
      }
    };
  }

  /**
   * Initialize as HOST.
   */
  public async createRoom(roomId: string): Promise<boolean> {
    this.isHostUser = true;
    
    // Close existing peer if any
    if (this.peer) {
        this.peer.destroy();
    }

    const uniquePeerId = `${APP_PREFIX}${roomId}`;
    console.log(`[Host] Initializing with ID: ${uniquePeerId}`);

    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(uniquePeerId, this.getPeerConfig());

        this.peer.on('open', (id) => {
          console.log('[Host] Peer Server Open. ID:', id);
          resolve(true);
        });

        this.peer.on('error', (err: any) => {
          console.error('[Host] Peer error:', err);
          if (err.type === 'unavailable-id') {
            reject(new Error(`Room code ${roomId} is currently in use. Please try another.`));
          } else if (err.type === 'peer-unavailable') {
             reject(new Error('Peer unavailable. Check your internet connection.'));
          } else {
            reject(new Error(`Connection error: ${err.type}`));
          }
        });

        this.peer.on('connection', (conn) => {
          this.handleIncomingConnection(conn);
        });

        this.peer.on('disconnected', () => {
             console.warn('[Host] Disconnected from signaling server. Attempting reconnect...');
             this.peer?.reconnect();
        });

      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Initialize as CLIENT.
   */
  public async joinRoom(roomId: string): Promise<boolean> {
    this.isHostUser = false;

    // Close existing peer if any
    if (this.peer) {
        this.peer.destroy();
    }

    console.log(`[Client] Connecting to Room Code: ${roomId}`);

    return new Promise((resolve, reject) => {
      try {
        // Client gets a random ID (let PeerJS assign it)
        this.peer = new Peer(undefined, this.getPeerConfig());

        this.peer.on('open', (id) => {
          console.log('[Client] My Peer ID:', id);
          if (!this.peer) return;

          const hostPeerId = `${APP_PREFIX}${roomId}`;
          console.log('[Client] Attempting connection to host:', hostPeerId);

          // Connect to Host
          const conn = this.peer.connect(hostPeerId, { 
              reliable: true,
              serialization: 'json'
          });

          conn.on('open', () => {
            console.log('[Client] Connection established with Host!');
            this.hostConn = conn;
            this.setupDataListener(conn);
            resolve(true);
          });

          conn.on('error', (err) => {
            console.error('[Client] Connection error:', err);
            reject(err);
          });
          
          conn.on('close', () => {
              console.warn('[Client] Connection closed by host');
          });
          
          // Timeout handling
          setTimeout(() => {
            if (!conn.open) {
                // If not open after 10s, it's likely a NAT issue or Room doesn't exist
                if (this.hostConn !== conn) {
                     // Check if we actually connected in the meantime
                     return; 
                }
                reject(new Error('Connection timed out. The room might not exist or the host is behind a strict firewall.'));
            }
          }, 10000);
        });

        this.peer.on('error', (err: any) => {
          console.error('[Client] Peer Error:', err);
          reject(new Error(`Peer Error: ${err.type}`));
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
      } else {
          console.warn('Cannot send message, not connected to host');
      }
    }
  }

  public subscribe(callback: (message: NetworkMessage) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  public disconnect() {
      if (this.peer) {
          this.peer.destroy();
          this.peer = null;
      }
      this.hostConn = null;
      this.clientConns.clear();
      this.isHostUser = false;
  }

  // --- Private Helpers ---

  private notifyListeners(message: NetworkMessage) {
    this.listeners.forEach(listener => listener(message));
  }

  private handleIncomingConnection(conn: DataConnection) {
    console.log('[Host] New connection request from', conn.peer);
    
    conn.on('open', () => {
      console.log('[Host] Connection opened for', conn.peer);
      this.clientConns.set(conn.peer, conn);
    });

    conn.on('close', () => {
      console.log('[Host] Connection closed for', conn.peer);
      this.clientConns.delete(conn.peer);
    });

    conn.on('error', (err) => {
        console.error('[Host] Connection error for peer', conn.peer, err);
        this.clientConns.delete(conn.peer);
    });

    this.setupDataListener(conn);
  }

  private setupDataListener(conn: DataConnection) {
    conn.on('data', (data: any) => {
      const message = data as NetworkMessage;
      
      // 1. Update self
      this.notifyListeners(message);

      // 2. If I am Host, I need to relay this message to everyone else
      if (this.isHostUser) {
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