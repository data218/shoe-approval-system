import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';

import Landing from './pages/Landing';

// Placeholder components
const Dashboard = () => <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-100"><h2 className="text-xl font-semibold mb-4">Dashboard (Under Construction)</h2><p className="text-slate-500">More features coming soon...</p></div>;
const Inbox = () => <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-100"><h2 className="text-xl font-semibold mb-4">Approval Inbox (Under Construction)</h2></div>;
const NewRequest = () => <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-100"><h2 className="text-xl font-semibold mb-4">New Request (Under Construction)</h2></div>;

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  
  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50">Loading...</div>;
  }
  
  if (!session) {
    return <Navigate to="/login" replace />;
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
