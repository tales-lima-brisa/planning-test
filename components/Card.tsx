import React from 'react';

interface CardProps {
  value: string | number;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export const Card: React.FC<CardProps> = ({ value, selected, onClick, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative flex items-center justify-center w-16 h-24 md:w-20 md:h-32 rounded-xl font-bold text-2xl shadow-lg transition-all duration-300 transform
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-2 cursor-pointer'}
        ${
          selected
            ? 'bg-indigo-600 text-white ring-4 ring-indigo-400 scale-110 translate-y-[-10px]'
            : 'bg-slate-800 text-indigo-100 border-2 border-slate-700 hover:border-indigo-500 hover:shadow-indigo-500/50'
        }
      `}
    >
      <span className="absolute top-1 left-2 text-xs opacity-50">{value}</span>
      {value}
      <span className="absolute bottom-1 right-2 text-xs opacity-50 rotate-180">{value}</span>
    </button>
  );
};