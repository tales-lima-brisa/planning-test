
import React, { useState } from 'react';
import { Task } from '../types';
import { Plus, Trash2, CheckCircle, Circle, Play, Edit2, X, Check } from 'lucide-react';

interface TaskListProps {
  tasks: Task[];
  currentTaskId: string | null;
  isHost: boolean;
  onAddTask: (title: string) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, title: string) => void;
  onSelectTask: (id: string) => void;
}

export const TaskList: React.FC<TaskListProps> = ({ 
  tasks, currentTaskId, isHost, onAddTask, onDeleteTask, onUpdateTask, onSelectTask 
}) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim()) {
      onAddTask(newTaskTitle);
      setNewTaskTitle('');
    }
  };

  const startEditing = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(task.id);
    setEditTitle(task.title);
  };

  const saveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingId && editTitle.trim()) {
      onUpdateTask(editingId, editTitle);
      setEditingId(null);
      setEditTitle('');
    }
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditTitle('');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(confirm('Delete this task?')) {
        onDeleteTask(id);
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
              group p-3 rounded-lg border transition-all cursor-pointer relative
              ${currentTaskId === task.id 
                ? 'bg-indigo-900/20 border-indigo-500/50' 
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'}
            `}
            onClick={() => isHost && !editingId && onSelectTask(task.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                 {task.status === 'completed' ? (
                   <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                 ) : currentTaskId === task.id ? (
                   <Play className="w-5 h-5 text-indigo-400 fill-indigo-400 animate-pulse flex-shrink-0" />
                 ) : (
                   <Circle className="w-5 h-5 text-slate-500 flex-shrink-0" />
                 )}
                 
                 <div className="flex-1 min-w-0">
                   {editingId === task.id ? (
                       <input 
                          type="text" 
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-slate-950 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
                          autoFocus
                       />
                   ) : (
                       <>
                        <p className={`text-sm font-medium truncate ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                            {task.title}
                        </p>
                        {task.finalScore && (
                            <span className="text-xs text-emerald-400 font-mono mt-1 block">Score: {task.finalScore}</span>
                        )}
                       </>
                   )}
                 </div>
              </div>

              {isHost && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {editingId === task.id ? (
                          <>
                            <button onClick={saveEdit} className="p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded">
                                <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={cancelEdit} className="p-1.5 hover:bg-red-500/20 text-red-400 rounded">
                                <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                      ) : (
                          <>
                            <button onClick={(e) => startEditing(task, e)} className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded">
                                <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => handleDelete(task.id, e)} className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                      )}
                  </div>
              )}
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
