import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`w-full pr-10 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Sembunyikan password' : 'Lihat password'}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
