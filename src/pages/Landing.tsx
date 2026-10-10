import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, CheckCircle, Zap, FileText, ToggleLeft, ToggleRight } from 'lucide-react';

export default function Landing() {
  const [isModernDesign, setIsModernDesign] = useState(true);

  if (!isModernDesign) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-brand-500/30 font-sans">
        {/* Navigation */}
        <nav className="fixed top-0 w-full z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md shadow-sm">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">Oh <span className="text-brand-600">Shoes</span></span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setIsModernDesign(true)} className="flex items-center gap-2 text-sm font-semibold text-brand-600 border border-brand-200 px-3 py-1.5 rounded-full hover:bg-brand-50 transition-colors">
                <ToggleLeft className="w-4 h-4" /> Try Modern Design
              </button>
              <Link to="/login" className="text-sm font-semibold text-slate-600 hover:text-brand-600 transition-colors">
                Sign In
              </Link>
              <Link 
                to="/login" 
                className="text-sm font-semibold bg-brand-600 text-white px-5 py-2 rounded-full hover:bg-brand-700 transition-colors flex items-center gap-2 shadow-md shadow-brand-600/20"
              >
                Access Portal
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <main className="pt-32 pb-20 px-6 relative overflow-hidden">
          {/* Background Gradients */}
          <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-brand-400/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-sky-400/20 rounded-full blur-[120px]" />

          <div className="max-w-7xl mx-auto relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 text-brand-700 text-xs font-bold uppercase tracking-wider mb-6 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-brand-600 animate-pulse" />
                Internal Approval System
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 mb-6 tracking-tight leading-tight">
                Streamline your <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-sky-500">
                  showroom operations
                </span>
              </h1>
              <p className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed max-w-2xl mx-auto">
                The enterprise-grade portal for managing Goods Purchase Requests and Customer Discounts with intelligent multi-level workflows.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link 
                  to="/login" 
                  className="w-full sm:w-auto px-8 py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-full font-bold transition-all transform hover:scale-105 flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30"
                >
                  Employee Login
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center mb-4 border border-sky-100">
                  <CheckCircle className="w-6 h-6 text-sky-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Multi-Level Approvals</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Automated routing from Employees to Managers and Final Approvers with full accountability.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mb-4 border border-brand-100">
                  <Zap className="w-6 h-6 text-brand-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Smart Validation</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Automatic warnings for high-value purchases and excessive discount requests before they reach the manager.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-4 border border-emerald-100">
                  <FileText className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Complete Audit Trail</h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Track every state change, remark, send-back, and final decision in a secure, immutable history log.
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 py-8 text-center mt-12 bg-white">
          <p className="text-slate-500 text-sm font-medium">
            © {new Date().getFullYear()} Oh Shoes Enterprise. All rights reserved.
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-red-600 text-white selection:bg-white/30 font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-red-500/30 bg-red-600/80 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Oh <span className="text-red-200">Shoes</span></span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsModernDesign(false)} className="flex items-center gap-2 text-sm font-semibold text-white border border-red-400 px-3 py-1.5 rounded-full hover:bg-red-500 transition-colors">
               <ToggleRight className="w-4 h-4 text-white" /> View Original Design
            </button>
            <Link to="/login" className="text-sm font-semibold text-red-100 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link 
              to="/login" 
              className="text-sm font-semibold bg-white text-red-600 px-5 py-2 rounded-full hover:bg-red-50 transition-colors flex items-center gap-2 shadow-md shadow-red-900/20"
            >
              Access Portal
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-20 px-6 relative overflow-hidden min-h-[80vh] flex items-center">
        {/* Shopping Girl Image */}
        <div className="absolute inset-y-0 right-0 w-full md:w-[70%] z-0 pointer-events-none opacity-90 mix-blend-luminosity">
          <img 
            src="/hero-girl.png" 
            alt="Shopping" 
            className="w-full h-full object-cover object-right-top mask-gradient"
            style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black 30%)' }}
          />
        </div>

        {/* Background Gradients and Watermark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full text-center pointer-events-none select-none opacity-20 z-0">
          <h1 className="text-[12rem] md:text-[20rem] font-extrabold text-black tracking-tighter leading-none">
            SHOES
          </h1>
        </div>

        <div className="absolute inset-0 bg-red-600/20 mix-blend-multiply z-0 pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10 w-full flex">
          <div className="max-w-2xl text-left mb-16 md:pl-10">
            <h1 className="text-6xl md:text-8xl font-extrabold text-white mb-6 tracking-tight leading-tight relative">
              <span className="absolute -top-12 left-0 font-script text-5xl md:text-7xl text-red-300 transform -rotate-12 whitespace-nowrap opacity-90">
                Oh Shoes
              </span>
              Enterprise<br/>
              Approval
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-10 leading-relaxed max-w-xl">
              The premium portal for managing Goods Purchase Requests and Customer Discounts with intelligent multi-level workflows.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-start gap-4">
              <Link 
                to="/login" 
                className="w-full sm:w-auto px-8 py-4 bg-white text-red-600 hover:bg-slate-100 rounded-full font-bold transition-all transform hover:scale-105 flex items-center justify-center gap-2 shadow-xl"
              >
                Employee Login
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
            </div>
          </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-red-500 py-8 text-center bg-red-600/50 mt-12 backdrop-blur-sm z-10 relative">
        <p className="text-white/80 text-sm font-medium">
          © {new Date().getFullYear()} Oh Shoes Enterprise. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
