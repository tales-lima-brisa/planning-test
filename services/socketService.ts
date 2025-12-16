import { NetworkMessage } from '../types';

/**
 * SocketService using native WebSockets.
 * Connects to a specific IP/URL provided by the user.
 */
class SocketService {
  private ws: WebSocket | null = null;
  private listeners: ((message: NetworkMessage) => void)[] = [];
  public isConnected: boolean = false;

  constructor() {}

  /**
   * Connect to the WebSocket server at the given URL.
   * Note: This does NOT automatically send a JOIN message anymore.
   * You must send JOIN manually after connection.
   */
  public async connect(serverUrl: string): Promise<boolean> {
    // Clean up existing connection if any
    this.disconnect();

    // Ensure URL has protocol
    let url = serverUrl;
    
    // CORRECTION FOR HTTPS/PRODUCTION:
    // If no protocol is provided, default to wss:// (Secure) instead of ws://
    // This fixes the "insecure WebSocket connection" error on Vercel/HTTPS.
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
        url = `wss://${url}`;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`Connecting to ${url}...`);
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('WebSocket Connected');
          this.isConnected = true;
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
          this.isConnected = false;
          reject(new Error('Failed to connect. The server might be asleep (Railway) or blocked by firewall.'));
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
      
      // Notify local listeners (Optimistic UI updates)
      this.notifyListeners(message);
    } else {
      console.warn('WebSocket not connected, cannot send message:', message.type);
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