import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Inbox, 
  PlusCircle, 
  Settings, 
  LogOut,
  Bell
} from 'lucide-react';
import clsx from 'clsx';

export default function MainLayout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Inbox', path: '/inbox', icon: Inbox },
    { name: 'New Request', path: '/new', icon: PlusCircle },
  ];

  if (profile?.role === 'ADMIN') {
    navItems.push({ name: 'Settings', path: '/settings', icon: Settings });
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white flex flex-col hidden md:flex">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight">ShoeApproval</h1>
          <p className="text-xs text-slate-400 mt-1">Enterprise System</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive 
                    ? 'bg-slate-800 text-white' 
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                )}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium">
              {profile?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name}</p>
              <p className="text-xs text-slate-400 truncate">{profile?.role}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="md:hidden font-bold">ShoeApproval</div>
          <div className="hidden md:block text-slate-600 font-medium">
            {navItems.find(i => i.path === location.pathname)?.name || 'Shoe Approval System'}
          </div>
          
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-slate-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
