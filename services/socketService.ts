import { NetworkMessage, GameState } from '../types';

/**
 * Since we don't have a real NodeJS backend in this environment,
 * we use the BroadcastChannel API to simulate a WebSocket.
 * This allows multiple tabs/windows in the same browser to communicate 
 * exactly like they would over a network socket.
 */
class SocketService {
  private channel: BroadcastChannel | null = null;
  private listeners: ((message: NetworkMessage) => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.channel = new BroadcastChannel('agile-vote-network');
      this.channel.onmessage = (event) => {
        this.notifyListeners(event.data);
      };
    }
  }

  public connect(roomId: string, userId: string) {
    // In a real app, this would establish the WS connection
    console.log(`Connected to room ${roomId} as ${userId}`);
  }

  public send(message: NetworkMessage) {
    if (this.channel) {
      this.channel.postMessage(message);
    }
    // We also notify ourself because BroadcastChannel only notifies *other* tabs
    this.notifyListeners(message);
  }

  public subscribe(callback: (message: NetworkMessage) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(message: NetworkMessage) {
    this.listeners.forEach(listener => listener(message));
  }
}

export const socketService = new SocketService();