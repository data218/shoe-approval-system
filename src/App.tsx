import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';

import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Inbox from './pages/Inbox';
import NewRequest from './pages/NewRequest';
import Items from './pages/Items';
import Users from './pages/Users';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  
  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50">Loading...</div>;
  }
  
  if (!session) {
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

      
      {/* Protected Enterprise Routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <MainLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="new" element={<NewRequest />} />
        <Route path="items" element={<Items />} />
        <Route path="users" element={<Users />} />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
