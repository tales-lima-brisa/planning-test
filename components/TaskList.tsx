import React, { useState } from 'react';
import { Task } from '../types';
import { Plus, Trash2, CheckCircle, Circle, Play } from 'lucide-react';

interface TaskListProps {
  tasks: Task[];
  currentTaskId: string | null;
  isHost: boolean;
  onAddTask: (title: string) => void;
  onSelectTask: (id: string) => void;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, currentTaskId, isHost, onAddTask, onSelectTask }) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim()) {
      onAddTask(newTaskTitle);
      setNewTaskTitle('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 w-full md:w-80">
      <div className="p-4 border-b border-slate-800">
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          Tasks
          <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">{tasks.length}</span>
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tasks.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm italic">
            No tasks yet. Add one to get started.
          </div>
        )}
        
        {tasks.map(task => (
          <div 
            key={task.id}
            className={`
              group p-3 rounded-lg border transition-all cursor-pointer
              ${currentTaskId === task.id 
                ? 'bg-indigo-900/20 border-indigo-500/50' 
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'}
            `}
            onClick={() => isHost && onSelectTask(task.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                 {task.status === 'completed' ? (
                   <CheckCircle className="w-5 h-5 text-emerald-500" />
                 ) : currentTaskId === task.id ? (
                   <Play className="w-5 h-5 text-indigo-400 fill-indigo-400 animate-pulse" />
                 ) : (
                   <Circle className="w-5 h-5 text-slate-500" />
                 )}
                 <div>
                   <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                     {task.title}
                   </p>
                   {task.finalScore && (
                     <span className="text-xs text-emerald-400 font-mono mt-1 block">Score: {task.finalScore}</span>
                   )}
                 </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isHost && (
        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="New task..."
              className="flex-1 bg-slate-800 border border-slate-700 text-white text-sm rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-slate-500"
            />
            <button
              type="submit"
              disabled={!newTaskTitle.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-md transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};