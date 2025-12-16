import { NetworkMessage, User } from '../types';

/**
 * SocketService using native WebSockets.
 * Connects to a specific IP/URL provided by the user.
 */
class SocketService {
  private ws: WebSocket | null = null;
  private listeners: ((message: NetworkMessage) => void)[] = [];
  private isConnected: boolean = false;

  constructor() {}

  /**
   * Connect to the WebSocket server at the given URL
   */
  public async connect(serverUrl: string, roomId: string, user: User): Promise<boolean> {
    // Ensure URL has protocol
    let url = serverUrl;
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        // Default to unsecured ws:// if likely local IP, otherwise could guess
        url = `ws://${url}`;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`Connecting to ${url}...`);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('WebSocket Connected');
          this.isConnected = true;
          
          // Immediately send JOIN message to register this socket to the room on server
          this.send({
              type: 'JOIN',
              roomId: roomId,
              payload: user,
              senderId: user.id
          });

          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as NetworkMessage;
            this.notifyListeners(message);
          } catch (e) {
            console.error('Failed to parse WebSocket message', e);
          }
        };

        this.ws.onerror = (err) => {
          console.error('WebSocket Error:', err);
          reject(new Error('Failed to connect to server. Check IP and Port.'));
        };

        this.ws.onclose = () => {
          console.log('WebSocket Closed');
          this.isConnected = false;
        };

      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Send a message to the server
   */
  public send(message: NetworkMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      
      // Since WebSocket usually sends to *server* which broadcasts to *others*,
      // we need to verify if we should notify local listeners ourselves.
      // In this app pattern, we usually update local state immediately (optimistic) 
      // OR we listen for the echo. 
      // The `server.js` implementation I provided broadcasts to OTHERS.
      // So we must notify ourselves here to see our own actions if the UI doesn't handle it optimistically.
      // NOTE: App.tsx handles VOTE optimistically, but typically not others like JOIN/RESET.
      // Let's notify listeners locally to ensure consistent state.
      this.notifyListeners(message);
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  public subscribe(callback: (message: NetworkMessage) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private notifyListeners(message: NetworkMessage) {
    this.listeners.forEach(listener => listener(message));
  }
}

export const socketService = new SocketService();