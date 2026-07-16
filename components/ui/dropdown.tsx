import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface DropdownProps {
  options: DropdownOption[];
  selectedValue: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedValue,
  onChange,
  className = '',
  placeholder = 'Select an option'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === selectedValue);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-x-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 shadow-sm ring-1 ring-inset ring-slate-800 hover:bg-slate-800/80 transition-colors"
      >
        <span className="flex items-center gap-2">
          {selectedOption?.icon}
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-1 w-56 origin-top-right rounded-lg bg-slate-950 border border-slate-850 p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
          >
            <div className="py-1" role="none">
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                    option.value === selectedValue
                      ? 'bg-violet-600/20 text-violet-400 font-medium border border-violet-500/20'
                      : 'text-slate-350 hover:bg-slate-900 hover:text-slate-100'
                  }`}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dropdown;
