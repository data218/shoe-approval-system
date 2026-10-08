import { useState, useRef, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const themes = [
  { id: 'default', name: 'Indigo', color: 'bg-brand-600' },
  { id: 'ocean', name: 'Ocean', color: 'bg-cyan-600' },
  { id: 'forest', name: 'Forest', color: 'bg-emerald-600' },
  { id: 'sunset', name: 'Sunset', color: 'bg-orange-500' },
  { id: 'rose', name: 'Rose', color: 'bg-rose-500' },
] as const;

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-brand-500 hover:text-brand-600 relative rounded-full hover:bg-brand-50 transition-colors flex items-center justify-center"
        title="Change Theme"
      >
        <Palette className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="px-3 py-2 border-b border-slate-50 mb-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Theme</p>
          </div>
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id as any);
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left flex items-center justify-between hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full ${t.color} shadow-sm group-hover:scale-110 transition-transform`} />
                <span className={`text-sm font-medium ${theme === t.id ? 'text-slate-900' : 'text-slate-600'}`}>
                  {t.name}
                </span>
              </div>
              {theme === t.id && (
                <Check className="w-4 h-4 text-brand-600" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
