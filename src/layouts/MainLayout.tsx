import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Inbox, 
  PlusCircle, 
  LogOut, 
  ShieldCheck,
  Menu,
  Package,
  Users as UsersIcon,
  Database
} from 'lucide-react';
import { useState } from 'react';
import ThemeSwitcher from '../components/ThemeSwitcher';
import NotificationsDropdown from '../components/NotificationsDropdown';

export default function MainLayout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Approval Inbox', href: '/dashboard/inbox', icon: Inbox },
    { name: 'New Request', href: '/dashboard/new', icon: PlusCircle },
    { name: 'Master Items', href: '/dashboard/items', icon: Package },
  ];

  if (profile?.role === 'ADMIN') {
    navigation.push({ name: 'User Management', href: '/dashboard/users', icon: UsersIcon });
    navigation.push({ name: 'Data Management', href: '/dashboard/data', icon: Database });
  }

  return (
    <div className="min-h-screen bg-slate-100 flex font-sans">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-50 border-r border-slate-200 shadow-sm z-20">
        <div className="h-16 flex items-center justify-center px-6 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-md shadow-brand-200">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">Oh <span className="text-brand-600">Shoes</span></span>
          </div>
        </div>

        {profile && (
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-500 to-purple-500 border-2 border-white shadow-sm flex items-center justify-center text-sm font-bold text-white">
                {profile?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-slate-900 truncate">{profile?.full_name}</p>
                <p className="text-xs text-brand-600 truncate capitalize font-bold">{profile?.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                  isActive 
                    ? 'bg-brand-50 text-brand-700' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </div>

      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Topbar for Mobile & Global Actions */}
        <header className="h-16 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-4 sm:px-6 z-10 flex-shrink-0">
          <div className="flex items-center gap-3 md:hidden">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 -ml-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"
            >
              <Menu className="w-6 h-6" />
            </button>
            <span className="text-lg font-bold text-slate-900">ShowroomFlow</span>
          </div>

          <div className="flex-1 hidden md:flex" /> {/* Spacer */}

          <div className="flex items-center gap-4 ml-auto">
            <ThemeSwitcher />
            <NotificationsDropdown />
            <div className="w-px h-6 bg-slate-200"></div>
            <button
              onClick={() => signOut()}
              title="Sign Out"
              className="p-2 text-rose-500 hover:text-rose-600 relative rounded-full hover:bg-rose-50 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
            <aside className="fixed top-0 left-0 bottom-0 w-64 bg-white border-r border-slate-200 z-50 flex flex-col shadow-xl">
              <div className="h-16 flex items-center justify-center border-b border-slate-100 gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-md shadow-brand-200">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-slate-900 tracking-tight">Oh <span className="text-brand-600">Shoes</span></span>
              </div>
              {profile && (
                <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-500 to-purple-500 border-2 border-white shadow-sm flex items-center justify-center text-sm font-bold text-white">
                      {profile?.full_name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-bold text-slate-900 truncate">{profile?.full_name}</p>
                      <p className="text-xs text-brand-600 truncate capitalize font-bold">{profile?.role?.replace('_', ' ')}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex-1 py-6 px-4 space-y-1">
                {navigation.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium ${
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
              
            </aside>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-slate-50">
          <div className="max-w-7xl mx-auto pb-12">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
