import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-red-600 text-white selection:bg-white/30 font-sans">
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
