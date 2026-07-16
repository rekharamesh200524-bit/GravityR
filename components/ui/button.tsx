import React, { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseStyle = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';
    
    const variants = {
      primary: 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 border border-violet-500/20',
      secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700/50',
      ghost: 'hover:bg-slate-800/80 text-slate-400 hover:text-slate-100',
      outline: 'border border-slate-700 hover:bg-slate-800/60 text-slate-300 hover:text-slate-100',
      destructive: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/10',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-2.5 text-base',
      icon: 'p-2 text-sm',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
