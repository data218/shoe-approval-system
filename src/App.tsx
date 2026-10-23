import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import MainLayout from './layouts/MainLayout';
const Login = lazy(() => import('./pages/Login'));

const Landing = lazy(() => import('./pages/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inbox = lazy(() => import('./pages/Inbox'));
const NewRequest = lazy(() => import('./pages/NewRequest'));
const Items = lazy(() => import('./pages/Items'));
const Users = lazy(() => import('./pages/Users'));
const DataManagement = lazy(() => import('./pages/DataManagement'));
const PettyCash = lazy(() => import('./pages/PettyCash'));
const UpdatePassword = lazy(() => import('./pages/UpdatePassword'));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, profile, loading } = useAuth();
  
  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50">Loading...</div>;
  }
  
  if (!session || !profile) {
    return <Navigate to="/" replace />;
  }


  
  return <>{children}</>;
};



function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50">Loading...</div>;
  }

  return (
    <Routes>
      {/* Public Landing Page */}
      <Route path="/" element={session ? <Navigate to="/dashboard" replace /> : <Landing />} />
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/update-password" element={<UpdatePassword />} />

      
      {/* Protected Enterprise Routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <MainLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="new" element={<NewRequest />} />
        <Route path="petty-cash" element={<PettyCash />} />
        <Route path="items" element={<Items />} />
        <Route path="users" element={<Users />} />
        <Route path="data" element={<DataManagement />} />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div role="status" className="flex min-h-screen items-center justify-center text-slate-600">Loading your workspace…</div>}>
            <AppRoutes />
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
