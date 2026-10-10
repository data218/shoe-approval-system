import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Key, Mail, AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      setSuccess('Password reset link sent! Check your email.');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* Left Side - Colorful Brand Area */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-red-600 overflow-hidden items-center justify-center">
        <div className="absolute inset-0 z-0 opacity-80 mix-blend-luminosity">
          <img 
            src="/hero-girl.png" 
            alt="Shopping" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-red-600/90 to-red-900/90 z-10" />
        
        <div className="relative z-20 text-center text-white px-12">
          <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center shadow-2xl mx-auto mb-10 border border-white/30 transform hover:scale-105 transition-transform duration-300">
            <ShieldCheck className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-5xl font-extrabold mb-6 tracking-tight leading-tight">
            Oh Shoes <br/>
            <span className="text-red-200">Enterprise</span>
          </h1>
          <p className="text-xl text-red-100 max-w-md mx-auto leading-relaxed">
            The premium portal for managing Goods Purchase Requests and Customer Discounts.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 relative">
        {/* Subtle background decoration for mobile */}
        <div className="absolute inset-0 bg-gradient-to-b from-red-50 to-white z-0 lg:hidden" />
        
        <div className="mx-auto w-full max-w-sm lg:w-96 relative z-10">
          <div className="lg:hidden flex justify-center mb-10">
            <div className="w-20 h-20 bg-red-600 rounded-2xl flex items-center justify-center shadow-xl shadow-red-600/20">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
          </div>
          
          <div className="text-center lg:text-left mb-10">
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              Welcome back
            </h2>
            <p className="mt-2 text-base text-slate-600 font-medium">
              {isForgotPassword ? 'Reset your password' : 'Sign in to your account'}
            </p>
          </div>

          <div>
            <form className="space-y-6" onSubmit={handleAuth}>
              
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div className="text-sm text-red-800">{error}</div>
                </div>
              )}
              
              {success && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                  <div className="text-sm text-green-800 font-medium">{success}</div>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-sm font-semibold text-slate-700">Email address</label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="focus:ring-red-500 focus:border-red-500 block w-full pl-11 sm:text-sm border-slate-300 rounded-xl py-3 border transition-colors bg-slate-50 focus:bg-white"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              {!isForgotPassword && (
                <>
                  <div className="space-y-1">
                    <label className="block text-sm font-semibold text-slate-700">Password</label>
                    <div className="relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Key className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="focus:ring-red-500 focus:border-red-500 block w-full pl-11 pr-11 sm:text-sm border-slate-300 rounded-xl py-3 border transition-colors bg-slate-50 focus:bg-white"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center"
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5 text-red-500" />
                        ) : (
                          <Eye className="h-5 w-5 text-slate-400 hover:text-red-500 transition-colors" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setError(null);
                        setSuccess(null);
                      }}
                      className="text-sm font-semibold text-red-600 hover:text-red-500 transition-colors"
                    >
                      Forgot your password?
                    </button>
                  </div>
                </>
              )}

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (isForgotPassword) {
                      setIsForgotPassword(false);
                    } else {
                      navigate('/');
                    }
                  }}
                  className="w-full flex justify-center py-3 px-4 border border-slate-300 rounded-xl shadow-sm text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={isForgotPassword ? handleResetPassword : handleAuth}
                  disabled={loading}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg shadow-red-600/30 text-sm font-bold text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {loading ? 'Processing...' : isForgotPassword ? 'Send Reset Link' : 'Sign In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
