export interface User {
  id: string;
  name: string;
  isHost: boolean;
}

export interface Vote {
  userId: string;
  value: string | number;
}

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed';
  finalScore?: string | number;
}

export interface GameState {
  roomId: string | null;
  users: User[];
  votes: Record<string, string | number>; // userId -> value
  tasks: Task[];
  currentTaskId: string | null;
  isRevealed: boolean;
}

export type MessageType = 
  | 'JOIN' 
  | 'SYNC_REQUEST' 
  | 'SYNC_RESPONSE' 
  | 'VOTE' 
  | 'REVEAL' 
  | 'RESET' 
  | 'ADD_TASK' 
  | 'SELECT_TASK'
  | 'UPDATE_TASK_SCORE';

export interface NetworkMessage {
  type: MessageType;
  roomId: string;
  payload: any;
  senderId: string;
}

export const FIBONACCI_SEQ = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '?', '☕'];