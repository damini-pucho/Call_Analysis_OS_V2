'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Shield,
  Users,
  User,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ChevronDown
} from 'lucide-react';
import { signInAction } from '@/app/actions/auth';

// Floating Mascot Component with Gaze Cursor
const Mascot = ({
  imageSrc,
  delay,
  x,
  y,
  size = 'w-16 h-16',
  cursorColor = 'text-blue-500',
  cursorRotation = '0deg',
}) => {
  return (
    <div
      className={`absolute ${x} ${y} z-20 animate-float transition-all duration-300 hover:scale-110 hover:rotate-6 cursor-pointer pointer-events-auto`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div
        className={`${size} rounded-full overflow-hidden shadow-lg relative bg-white/60 backdrop-blur-md border border-white/50 p-0.5`}
      >
        <img
          src={imageSrc}
          alt="Avatar"
          className="w-full h-full object-cover rounded-full"
        />
      </div>
      <div
        className={`absolute -bottom-2 -right-2 ${cursorColor} drop-shadow-md`}
        style={{ transform: `rotate(${cursorRotation})` }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3.5 3.5L10.5 20.5L13.5 13.5L20.5 10.5L3.5 3.5Z"
            stroke="white"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};

// Preset demo credentials list
const DEMO_PRESETS = [
  {
    key: 'sahyog_admin',
    group: 'Sahyog Wealth (BFSI)',
    label: 'Admin · Nikhil Desai',
    role: 'Admin',
    email: 'admin@sahyog.demo',
    password: 'Demo-gU2L2_bR',
    badge: 'Admin',
  },
  {
    key: 'sahyog_tl1',
    group: 'Sahyog Wealth (BFSI)',
    label: 'Team Leader · Meera Iyer',
    role: 'Team Leader',
    email: 'meera.iyer@sahyog.demo',
    password: 'Demo-gU2L2_bR',
    badge: 'TL',
  },
  {
    key: 'sahyog_tl2',
    group: 'Sahyog Wealth (BFSI)',
    label: 'Team Leader · Rohit Bansal',
    role: 'Team Leader',
    email: 'rohit.bansal@sahyog.demo',
    password: 'Demo-gU2L2_bR',
    badge: 'TL',
  },
  {
    key: 'sahyog_exec1',
    group: 'Sahyog Wealth (BFSI)',
    label: 'Executive / Agent · Dipti Shah',
    role: 'Agent',
    email: 'dipti.shah@sahyog.demo',
    password: 'Demo-gU2L2_bR',
    badge: 'Agent',
  },
  {
    key: 'sahyog_exec2',
    group: 'Sahyog Wealth (BFSI)',
    label: 'Executive / Agent · Anurag Mehta',
    role: 'Agent',
    email: 'anurag.mehta@sahyog.demo',
    password: 'Demo-gU2L2_bR',
    badge: 'Agent',
  },
  {
    key: 'nirmal_admin',
    group: 'Nirmal Care Clinics (Healthcare)',
    label: 'Clinic Admin · Dr. Nirmal',
    role: 'Admin',
    email: 'admin@nirmal.demo',
    password: 'Demo-gU2L2_bR',
    badge: 'Admin',
  },
  {
    key: 'platform_admin',
    group: 'Pucho Platform',
    label: 'Platform Superadmin',
    role: 'Platform Admin',
    email: 'platform@pucho.ai',
    password: 'Demo-gU2L2_bR',
    badge: 'Superadmin',
  },
  {
    key: 'v1_admin',
    group: 'V1 Classic Demo Accounts',
    label: 'Super Admin · V1',
    role: 'Admin',
    email: 'superadmin@pucho.ai',
    password: 'Pucho@2026',
    badge: 'V1 Admin',
  },
  {
    key: 'v1_tl',
    group: 'V1 Classic Demo Accounts',
    label: 'Team Leader · Kavya Gohil',
    role: 'Team Leader',
    email: 'kavya.gohil@pucho.ai',
    password: 'Pucho@2026',
    badge: 'V1 TL',
  },
  {
    key: 'v1_agent',
    group: 'V1 Classic Demo Accounts',
    label: 'Agent · Darshan Soni',
    role: 'Agent',
    email: 'darshan.soni@pucho.ai',
    password: 'Pucho@2026',
    badge: 'V1 Agent',
  },
];

export function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const performLogin = async (userEmail, userPassword) => {
    setLoading(true);
    setError('');

    const targetEmail = (userEmail || email).trim();
    const targetPassword = userPassword || password;

    const res = await signInAction({
      email: targetEmail,
      password: targetPassword,
    });

    if (!res.ok) {
      setError(res.message || 'Login failed. Please check credentials.');
      setLoading(false);
      return;
    }

    const next = searchParams.get('next');
    const destination =
      res.data?.next === '/set-password'
        ? '/set-password'
        : next && next.startsWith('/') && !next.startsWith('//')
        ? next
        : res.data?.next || '/overview';

    router.replace(destination);
    router.refresh();
  };

  const handleDropdownSelect = (presetKey) => {
    setSelectedPresetKey(presetKey);
    const item = DEMO_PRESETS.find((p) => p.key === presetKey);
    if (item) {
      setEmail(item.email);
      setPassword(item.password);
      setError('');
    }
  };

  const handleQuickLogin = (roleType) => {
    if (roleType === 'admin') {
      const acc = DEMO_PRESETS.find((p) => p.key === 'sahyog_admin');
      setEmail(acc.email);
      setPassword(acc.password);
      setSelectedPresetKey(acc.key);
      performLogin(acc.email, acc.password);
    } else if (roleType === 'tl') {
      const acc = DEMO_PRESETS.find((p) => p.key === 'sahyog_tl1');
      setEmail(acc.email);
      setPassword(acc.password);
      setSelectedPresetKey(acc.key);
      performLogin(acc.email, acc.password);
    } else if (roleType === 'agent') {
      const acc = DEMO_PRESETS.find((p) => p.key === 'sahyog_exec1');
      setEmail(acc.email);
      setPassword(acc.password);
      setSelectedPresetKey(acc.key);
      performLogin(acc.email, acc.password);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAFAFF] relative flex items-center justify-center p-4 md:p-8 lg:p-12 overflow-hidden font-sans select-none">
      {/* Full Screen Grid Pattern - Base */}
      <div
        className="absolute inset-0 z-0 opacity-100 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          maskImage:
            'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0) 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0) 100%)',
        }}
      />

      {/* Interactive Grid Spotlight (Purple Glow) */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-60"
        style={{
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(124, 77, 255, 0.18), transparent 45%)`,
        }}
      />

      {/* Ambient Gradients - Left & Right */}
      <div className="absolute top-0 left-0 w-[500px] lg:w-[800px] h-[500px] lg:h-[800px] bg-purple-600/25 rounded-full blur-[80px] lg:blur-[130px] pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[500px] lg:w-[800px] h-[500px] lg:h-[800px] bg-indigo-600/25 rounded-full blur-[80px] lg:blur-[130px] pointer-events-none translate-x-1/2 translate-y-1/2" />

      {/* Floating Mascots - 4 Avatars */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden h-full w-full">
        {/* Top Left - Woman Green Beanie */}
        <Mascot
          imageSrc="/brand/mascot_1.png"
          x="top-[6%] left-4 md:top-[4%] md:left-[3%]"
          delay={0}
          size="w-12 h-12 md:w-16 md:h-16"
          cursorColor="text-blue-500"
          cursorRotation="-10deg"
        />

        {/* Top Center-Right - Man Cap */}
        <Mascot
          imageSrc="/brand/mascot_5.png"
          x="top-[6%] right-4 md:top-[4%] md:right-[3%]"
          delay={1.5}
          size="w-12 h-12 md:w-16 md:h-16"
          cursorColor="text-purple-500"
          cursorRotation="15deg"
        />

        {/* Bottom Center-Left - Man Turban */}
        <Mascot
          imageSrc="/brand/mascot_3.png"
          x="bottom-[6%] left-4 md:bottom-[4%] md:left-[4%]"
          delay={0.8}
          size="w-11 h-11 md:w-16 md:h-16"
          cursorColor="text-yellow-500"
          cursorRotation="-5deg"
        />

        {/* Bottom Right - Woman Hijab */}
        <Mascot
          imageSrc="/brand/mascot_4.png"
          x="bottom-[6%] right-4 md:bottom-[4%] md:right-[4%]"
          delay={2.2}
          size="w-11 h-11 md:w-16 md:h-16"
          cursorColor="text-emerald-500"
          cursorRotation="10deg"
        />
      </div>

      {/* Mobile Logo */}
      <div className="absolute top-6 left-0 right-0 flex justify-center md:hidden z-20">
        <img
          src="/brand/pucho_logo_official.png"
          alt="Pucho.ai"
          className="h-7 object-contain"
        />
      </div>

      <div className="w-full max-w-7xl mx-auto grid md:grid-cols-2 gap-8 md:gap-12 lg:gap-20 relative z-10 items-center">
        {/* Left Side: Marketing & Value Proposition */}
        <div className="text-center md:text-left space-y-4 md:space-y-8 md:pl-6 lg:pl-12">
          {/* Desktop/Tablet Logo */}
          <div className="hidden md:flex justify-start mb-6 lg:mb-12">
            <img
              src="/brand/pucho_logo_official.png"
              alt="Pucho.ai"
              className="h-8 lg:h-10 object-contain drop-shadow-sm"
            />
          </div>

          <div className="space-y-3 md:space-y-5 lg:space-y-6">
            <div className="space-y-1 md:space-y-1.5">
              <div className="font-bold text-[#111834] text-sm md:text-base lg:text-lg tracking-tight">
                Call Intelligence Platform
              </div>
              <div className="text-[10px] md:text-[11px] lg:text-xs font-black text-[#7C4DFF] tracking-widest uppercase drop-shadow-sm" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                BUILT ON PUCHO.AI
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-[68px] font-black text-[#111834] leading-[1.05] md:leading-[1] lg:leading-[0.95] tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-[#111834] via-[#2D1B69] to-[#7C4DFF]">
              Listen.
              <br />
              <span className="text-[#7C4DFF]">Analyze.</span>
              <br />
              Elevate.
            </h1>

            <p className="text-[#4B5563] text-xs md:text-sm lg:text-base leading-relaxed max-w-md mx-auto md:mx-0 font-medium hidden md:block">
              Transform your raw audio recordings into actionable intelligence. Evaluate 15 KPIs, track 7 SOP checkpoints, and elevate team performance with instant AI insights.
            </p>
          </div>

          {/* Feature Badges */}
          <div className="hidden md:flex flex-wrap justify-center md:justify-start gap-2.5 md:gap-3.5 pt-2">
            <div className="flex items-center gap-2 px-3.5 py-2 bg-purple-50/80 border border-purple-100/90 rounded-full text-xs font-bold text-[#7C4DFF] shadow-sm backdrop-blur-sm">
              <Sparkles className="w-4 h-4 text-[#7C4DFF]" />
              15 KPIs + 7 SOP Checkpoints
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50/80 border border-emerald-100/90 rounded-full text-xs font-bold text-emerald-700 shadow-sm backdrop-blur-sm">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Real-time Analytics Ready
            </div>
          </div>
        </div>

        {/* Right Side: Glassmorphic Login Card */}
        <div className="flex flex-col items-center justify-center w-full">
          <div className="bg-white/80 backdrop-blur-2xl p-6 sm:p-8 lg:p-9 rounded-3xl shadow-[0_20px_60px_-15px_rgba(124,77,255,0.18)] w-full max-w-md border border-white/90 relative overflow-hidden transition-all duration-300">
            {/* Top Card Glow Accent */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1.5 bg-gradient-to-r from-transparent via-[#7C4DFF] to-transparent rounded-full" />

            <div className="space-y-1.5 mb-5 text-left">
              <h2 className="text-2xl font-black text-[#111834] tracking-tight">Welcome Back</h2>
              <p className="text-gray-500 text-xs font-medium">Enter your credentials to access the Call Intelligence workspace.</p>
            </div>

            {/* DEMO CREDENTIALS DROPDOWN */}
            <div className="mb-4 text-left">
              <label htmlFor="demo-selector" className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#7C4DFF]" />
                  Select Demo Account
                </span>
                <span className="text-[10px] font-bold text-[#7C4DFF] bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                  Quick Fill
                </span>
              </label>
              <div className="relative">
                <select
                  id="demo-selector"
                  value={selectedPresetKey}
                  onChange={(e) => handleDropdownSelect(e.target.value)}
                  className="w-full h-11 pl-3.5 pr-10 rounded-2xl bg-purple-50/60 hover:bg-purple-50/90 border border-purple-200/90 text-xs font-bold text-gray-800 shadow-[0_2px_8px_rgba(124,77,255,0.06)] focus:outline-none focus:ring-2 focus:ring-[#7C4DFF]/30 focus:border-[#7C4DFF] transition-all cursor-pointer appearance-none"
                >
                  <option value="">— Choose a demo credential dropdown —</option>

                  <optgroup label="Sahyog Wealth Advisors (BFSI)">
                    <option value="sahyog_admin">Admin · Nikhil Desai (admin@sahyog.demo)</option>
                    <option value="sahyog_tl1">Team Leader · Meera Iyer (meera.iyer@sahyog.demo)</option>
                    <option value="sahyog_tl2">Team Leader · Rohit Bansal (rohit.bansal@sahyog.demo)</option>
                    <option value="sahyog_exec1">Agent / Executive · Dipti Shah (dipti.shah@sahyog.demo)</option>
                    <option value="sahyog_exec2">Agent / Executive · Anurag Mehta (anurag.mehta@sahyog.demo)</option>
                  </optgroup>

                  <optgroup label="Nirmal Care Clinics (Healthcare)">
                    <option value="nirmal_admin">Clinic Admin · Dr. Nirmal (admin@nirmal.demo)</option>
                  </optgroup>

                  <optgroup label="Pucho Platform">
                    <option value="platform_admin">Platform Superadmin (platform@pucho.ai)</option>
                  </optgroup>

                  <optgroup label="V1 Classic Accounts">
                    <option value="v1_admin">Admin (superadmin@pucho.ai)</option>
                    <option value="v1_tl">Team Leader · Kavya Gohil (kavya.gohil@pucho.ai)</option>
                    <option value="v1_agent">Agent · Darshan Soni (darshan.soni@pucho.ai)</option>
                  </optgroup>
                </select>
                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7C4DFF] pointer-events-none" />
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                performLogin();
              }}
              className="space-y-3.5"
            >
              {/* Email Input */}
              <div className="w-full space-y-1.5 text-left">
                <label className="block text-xs font-bold text-gray-700 tracking-wide">
                  Email / Username
                </label>
                <div className="relative flex items-center group">
                  <div className="absolute left-3.5 z-10 flex items-center justify-center pointer-events-none text-slate-400 group-focus-within:text-[#7C4DFF] transition-colors">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    placeholder="admin@sahyog.demo"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-11 pl-11 pr-4 rounded-2xl bg-white/90 backdrop-blur-sm border border-gray-200/90 text-gray-900 text-sm font-semibold placeholder-gray-400 shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-[#7C4DFF]/20 focus:border-[#7C4DFF] focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="w-full space-y-1.5 text-left">
                <label className="block text-xs font-bold text-gray-700 tracking-wide">
                  Password
                </label>
                <div className="relative flex items-center group">
                  <div className="absolute left-3.5 z-10 flex items-center justify-center pointer-events-none text-slate-400 group-focus-within:text-[#7C4DFF] transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full h-11 pl-11 pr-11 rounded-2xl bg-white/90 backdrop-blur-sm border border-gray-200/90 text-gray-900 text-sm font-semibold placeholder-gray-400 shadow-[0_2px_8px_rgba(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-[#7C4DFF]/20 focus:border-[#7C4DFF] focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 p-1 text-gray-400 hover:text-[#7C4DFF] transition-colors cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50/90 border border-red-200 text-red-600 text-xs font-bold animate-in fade-in text-left">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full h-[48px] flex items-center justify-center gap-2 rounded-2xl transition-all duration-300 font-bold text-sm text-white shadow-[0_8px_20px_rgba(124,77,255,0.3)] hover:shadow-[0_12px_28px_rgba(124,77,255,0.4)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer overflow-hidden group mt-1"
                style={{
                  background: 'linear-gradient(135deg, #7C4DFF 0%, #5833EF 50%, #3A10CE 100%)',
                }}
              >
                {/* Gloss Accent */}
                <div className="absolute top-0 left-0 right-0 h-[22px] bg-gradient-to-b from-white/20 to-transparent pointer-events-none rounded-t-2xl group-hover:opacity-0 transition-opacity" />

                <span className="relative z-10 flex items-center gap-2">
                  {loading ? 'Authenticating...' : 'Sign In to Workspace'}
                  {!loading && (
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  )}
                </span>
              </button>
            </form>

            {/* 3 Quick-Login Credential Buttons */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2.5 text-left">
                <span className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#7C4DFF]" />
                  1-Click Quick Login
                </span>
                <span className="text-[10px] text-gray-400 font-bold">Select Role</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {/* 1. Admin */}
                <button
                  type="button"
                  onClick={() => handleQuickLogin('admin')}
                  disabled={loading}
                  className="p-2.5 rounded-2xl bg-purple-50/80 hover:bg-purple-100/90 border border-purple-100 transition-all text-left flex flex-col justify-between group cursor-pointer hover:shadow-sm hover:-translate-y-0.5"
                >
                  <div className="w-6 h-6 rounded-lg bg-purple-100 text-[#7C4DFF] flex items-center justify-center mb-1 group-hover:bg-[#7C4DFF] group-hover:text-white transition-colors">
                    <Shield className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-gray-900 leading-tight">Admin</p>
                    <p className="text-[9px] text-[#7C4DFF] font-bold">Nikhil Desai</p>
                  </div>
                </button>

                {/* 2. Team Leader */}
                <button
                  type="button"
                  onClick={() => handleQuickLogin('tl')}
                  disabled={loading}
                  className="p-2.5 rounded-2xl bg-blue-50/80 hover:bg-blue-100/90 border border-blue-100 transition-all text-left flex flex-col justify-between group cursor-pointer hover:shadow-sm hover:-translate-y-0.5"
                >
                  <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-1 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-gray-900 leading-tight">Team Lead</p>
                    <p className="text-[9px] text-blue-600 font-bold">Meera Iyer</p>
                  </div>
                </button>

                {/* 3. Agent / Executive */}
                <button
                  type="button"
                  onClick={() => handleQuickLogin('agent')}
                  disabled={loading}
                  className="p-2.5 rounded-2xl bg-emerald-50/80 hover:bg-emerald-100/90 border border-emerald-100 transition-all text-left flex flex-col justify-between group cursor-pointer hover:shadow-sm hover:-translate-y-0.5"
                >
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-1 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-gray-900 leading-tight">Agent</p>
                    <p className="text-[9px] text-emerald-600 font-bold">Dipti Shah</p>
                  </div>
                </button>
              </div>
            </div>

            <p className="mt-4 text-center text-[12px] text-gray-500">
              New to Call Analysis OS?{' '}
              <Link
                href="/signup"
                className="font-bold text-[#7C4DFF] hover:underline"
              >
                Create your organisation
              </Link>
            </p>
          </div>

          <p className="mt-4 text-center text-[11px] text-gray-400 font-medium">
            Powered by Pucho.ai
          </p>

          {/* Mobile Only: Badges below form */}
          <div className="block md:hidden text-center mt-5 space-y-2">
            <p className="text-[#4B5563] text-xs leading-relaxed max-w-xs mx-auto font-medium">
              Transform your call recordings into actionable intelligence with AI scoring across 15 KPIs and 7 SOPs.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 border border-purple-100 rounded-full text-[10px] font-bold text-[#7C4DFF]">
                <Sparkles className="w-3 h-3" />
                AI-Powered
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-[10px] font-bold text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Live System
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

