import React from 'react';
import { Link } from 'react-router-dom';
import { Search, Menu, Share2, Globe, MessageCircle } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-black flex flex-col font-sans relative overflow-hidden">
      {/* Navigation */}
      <nav className="absolute top-0 w-full z-50 flex items-center justify-between px-8 py-6 bg-black/40 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center">
            <div className="w-3 h-3 bg-black rounded-sm" />
          </div>
          <span className="text-white font-bold tracking-widest text-lg">LOGO WEB</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-semibold tracking-wider">
          <Link to="/" className="text-[#E59866] bg-[#E59866]/10 px-4 py-1.5 rounded-full">HOME</Link>
          <Link to="/" className="text-white hover:text-[#E59866] transition-colors">SHOP</Link>
          <Link to="/" className="text-white hover:text-[#E59866] transition-colors">ABOUT</Link>
          <Link to="/login" className="text-white hover:text-[#E59866] transition-colors">SIGN UP</Link>
        </div>

        <div className="flex items-center gap-6">
          <button className="text-white hover:text-[#E59866] transition-colors">
            <Search className="w-5 h-5" />
          </button>
          <button className="text-white hover:text-[#E59866] transition-colors md:hidden">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </nav>

      {/* Hero Content */}
      <main className="flex-1 relative flex items-center">
        {/* Background Image - Using a high quality Unsplash shoe image */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=2070&auto=format&fit=crop"
            alt="Running shoes" 
            className="w-full h-full object-cover object-center"
          />
          {/* Subtle gradient overlay to ensure text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-8 flex justify-between items-center">
          
          {/* Left Promotional Card */}
          <div className="bg-black/95 p-12 max-w-md border border-white/10 shadow-2xl backdrop-blur-md">
            <h2 className="text-[#E59866] text-6xl font-serif mb-2 tracking-tight">SALE</h2>
            <h3 className="text-white text-3xl font-serif mb-6 tracking-wide uppercase">SUPER OFFER</h3>
            
            <p className="text-[#E59866]/80 text-sm leading-relaxed mb-10 font-medium max-w-[280px]">
              Discover the latest trends in athletic footwear. 
              Elevate your performance with our premium selection of running shoes.
            </p>

            <Link 
              to="/login"
              className="inline-flex items-center justify-center px-8 py-3 bg-[#E59866] text-black font-bold text-sm tracking-wider rounded-full hover:bg-[#d68a59] transition-transform hover:scale-105"
            >
              SHOP NOW
            </Link>
          </div>

          {/* Social Icons (Right side) */}
          <div className="hidden lg:flex flex-col gap-4">
            <a href="#" className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-[#E59866] hover:text-black transition-all">
              <Share2 className="w-4 h-4" />
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-[#E59866] hover:text-black transition-all">
              <Globe className="w-4 h-4" />
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-[#E59866] hover:text-black transition-all">
              <MessageCircle className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Floating Label (recreating the "NEW SHOES" pointer from the image) */}
        <div className="absolute top-[60%] left-[55%] hidden md:flex items-center gap-4 z-20 group cursor-pointer">
          <div className="relative w-12 h-12 rounded-full bg-[#E59866]/30 flex items-center justify-center animate-pulse">
            <div className="w-6 h-6 bg-white rounded-full group-hover:scale-110 transition-transform" />
          </div>
          {/* Pointer line and text */}
          <div className="flex items-center">
            <div className="w-16 h-px bg-white/60 -ml-2" />
            <div className="border border-white/60 bg-black/60 backdrop-blur-sm px-6 py-2 rounded-full text-white text-sm font-bold tracking-widest whitespace-nowrap">
              NEW SHOES
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Carousel Dots */}
      <div className="absolute bottom-8 w-full flex justify-center gap-3 z-20">
        <div className="w-2 h-2 rounded-full bg-white cursor-pointer" />
        <div className="w-2 h-2 rounded-full bg-[#E59866] cursor-pointer ring-4 ring-[#E59866]/30" />
        <div className="w-2 h-2 rounded-full bg-white/50 cursor-pointer hover:bg-white transition-colors" />
        <div className="w-2 h-2 rounded-full bg-white/50 cursor-pointer hover:bg-white transition-colors" />
      </div>
    </div>
  );
}
