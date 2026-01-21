import { useEffect, useRef } from 'react';
import { API_URL } from '../api';

type LandingPageProps = {
  onLogin: () => void;
  onRegister: () => void;
};

const landingMarkup = `
  <div id="waitlist-modal" class="fixed inset-0 z-[60] hidden items-center justify-center">
    <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" data-action="close-waitlist"></div>
    <div class="relative w-[92%] max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 p-8 sm:p-10">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium">
            Early Access
          </div>
          <h3 class="text-3xl sm:text-4xl font-semibold text-slate-900 mt-4">Join our waitlist</h3>
          <p class="text-slate-600 mt-3">Be the first to know when new onboarding spots open.</p>
        </div>
        <button class="text-slate-400 hover:text-slate-700" aria-label="Close waitlist" data-action="close-waitlist">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div id="waitlist-success" class="hidden relative mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-8 text-emerald-800 overflow-hidden">
        <div class="confetti" aria-hidden="true">
          <span style="left: 5%; background: #22c55e; animation-delay: 0s;"></span>
          <span style="left: 12%; background: #6366f1; animation-delay: 0.2s;"></span>
          <span style="left: 20%; background: #f59e0b; animation-delay: 0.4s;"></span>
          <span style="left: 28%; background: #ec4899; animation-delay: 0.1s;"></span>
          <span style="left: 36%; background: #22c55e; animation-delay: 0.3s;"></span>
          <span style="left: 44%; background: #38bdf8; animation-delay: 0.5s;"></span>
          <span style="left: 52%; background: #f97316; animation-delay: 0.15s;"></span>
          <span style="left: 60%; background: #a855f7; animation-delay: 0.35s;"></span>
          <span style="left: 68%; background: #22c55e; animation-delay: 0.25s;"></span>
          <span style="left: 76%; background: #eab308; animation-delay: 0.45s;"></span>
          <span style="left: 84%; background: #6366f1; animation-delay: 0.05s;"></span>
          <span style="left: 92%; background: #ef4444; animation-delay: 0.3s;"></span>
        </div>
        <h4 class="relative text-2xl font-semibold">You’re on the list 🎉</h4>
        <p class="relative mt-3 text-base text-emerald-700">Thanks for joining! We will be in touch soon.</p>
      </div>
      <div id="waitlist-alert" class="hidden mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"></div>
      <form id="waitlist-form" class="mt-6 grid gap-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-sm font-medium text-slate-700">Full name</label>
            <input name="fullName" type="text" required class="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none" placeholder="Jordan Lee">
          </div>
          <div>
            <label class="text-sm font-medium text-slate-700">Work email</label>
            <input name="email" type="email" required class="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none" placeholder="you@company.com">
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-sm font-medium text-slate-700">Organization</label>
            <input name="organization" type="text" required class="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none" placeholder="Company or community">
          </div>
          <div>
            <label class="text-sm font-medium text-slate-700">Role</label>
            <input name="role" type="text" class="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none" placeholder="HR, Admin, Team Lead">
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="text-sm font-medium text-slate-700">Team size</label>
            <select name="teamSize" class="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-400 focus:outline-none">
              <option value="">Select team size</option>
              <option value="1-25">1-25</option>
              <option value="26-50">26-50</option>
              <option value="51-200">51-200</option>
              <option value="201-1000">201-1000</option>
              <option value="1000+">1000+</option>
            </select>
          </div>
          <div>
            <label class="text-sm font-medium text-slate-700">Country</label>
            <input name="country" type="text" class="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none" placeholder="United States">
          </div>
        </div>
        <div class="flex flex-col sm:flex-row gap-3 items-center justify-between pt-2">
          <p class="text-xs text-slate-500">We will never share your details. Expect a short follow-up.</p>
          <button type="submit" class="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition-all">
            Join waitlist
          </button>
        </div>
      </form>
    </div>
  </div>

  <nav class="fixed top-0 left-0 right-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
    <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
            <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"></path>
            <path d="M20 2v4"></path>
            <path d="M22 4h-4"></path>
            <circle cx="4" cy="20" r="2"></circle>
          </svg>
        </div>
        <span class="text-lg font-semibold tracking-tight text-slate-900">MomentOS</span>
      </div>
      <div class="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
        <a href="#problem" class="hover:text-slate-900 transition-colors">The Problem</a>
        <a href="#how-it-works" class="hover:text-slate-900 transition-colors">How It Works</a>
        <a href="#features" class="hover:text-slate-900 transition-colors">Features</a>
        <a href="#pricing" class="hover:text-slate-900 transition-colors">Pricing</a>
      </div>
      <div class="flex items-center gap-4">
        <a href="#" data-action="open-waitlist" class="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-full transition-all shadow-lg shadow-slate-900/20">
          Join waitlist
        </a>
      </div>
    </div>
  </nav>

  <header class="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
    <div class="absolute inset-0 bg-grid -z-10 [mask-image:linear-gradient(to_bottom,white,transparent)]"></div>
    <div class="max-w-7xl mx-auto px-6 relative z-10">
      <div class="grid lg:grid-cols-2 gap-16 items-center">
        <div class="max-w-2xl">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium mb-8">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            Beta is now live
          </div>
          <h1 class="text-5xl sm:text-7xl font-semibold text-slate-900 tracking-tight leading-[1.1] mb-8">
            Never Miss a <br>
            <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Birthday Again</span>
          </h1>
          <p class="text-xl text-slate-600 leading-relaxed mb-6 font-normal">
            Automated birthday emails that feel personal, not robotic.
          </p>
          <p class="text-lg text-slate-500 mb-10 leading-relaxed max-w-lg">
            MomentOS helps teams, churches, startups, and organizations send thoughtful birthday messages automatically — without chasing designers, spreadsheets, or reminders.
          </p>
          <div class="flex flex-col sm:flex-row gap-4">
            <a href="#" data-action="open-waitlist" class="inline-flex justify-center items-center px-8 py-3.5 text-base font-medium rounded-full text-white bg-slate-900 hover:bg-slate-800 shadow-xl shadow-slate-900/10 transition-all hover:-translate-y-0.5">
              Join waitlist
            </a>
            <a href="#how-it-works" class="inline-flex justify-center items-center px-8 py-3.5 text-base font-medium rounded-full text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all">
              See How It Works
            </a>
          </div>
          <div class="mt-8 flex items-center gap-4 text-sm text-slate-500">
            <div class="flex -space-x-2">
              <div class="w-8 h-8 rounded-full bg-slate-200 border-2 border-white"></div>
              <div class="w-8 h-8 rounded-full bg-slate-300 border-2 border-white"></div>
              <div class="w-8 h-8 rounded-full bg-slate-400 border-2 border-white"></div>
            </div>
            <p>Set it once. We handle the moments.</p>
          </div>
        </div>

        <div class="relative h-[600px] hidden lg:block select-none pointer-events-none">
          <div class="absolute top-0 right-[-20%] w-[130%] h-full bg-gradient-to-bl from-indigo-600 via-blue-700 to-violet-900 rounded-l-[3rem] transform -skew-y-6 translate-y-12 shadow-2xl">
            <div class="absolute top-20 left-20 w-full h-full opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
          </div>

          <div class="absolute inset-0 flex items-center justify-center transform translate-x-12 translate-y-8">
            <div class="relative bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-[420px] transform -rotate-2 hover:rotate-0 transition-transform duration-700">
              <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5">
                      <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"></path>
                      <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-slate-900">Sarah from Marketing</div>
                    <div class="text-xs text-slate-500">Scheduled: Today, 9:00 AM</div>
                  </div>
                </div>
                <span class="px-2 py-1 rounded-md bg-green-50 text-green-700 text-xs font-medium">Ready</span>
              </div>
              <div class="space-y-3">
                <div class="h-2 bg-slate-100 rounded w-3/4"></div>
                <div class="h-2 bg-slate-100 rounded w-full"></div>
                <div class="h-2 bg-slate-100 rounded w-5/6"></div>
              </div>
              <div class="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center">
                <span class="text-xs text-slate-400">Template: Modern Fun</span>
                <span class="text-xs font-medium text-indigo-600">Edit</span>
              </div>
            </div>

            <div class="absolute -right-12 top-24 bg-white/90 backdrop-blur-sm rounded-xl shadow-xl border border-white/50 p-4 w-[280px] transform rotate-6 z-[-1]">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                    <path d="M8 2v4"></path>
                    <path d="M16 2v4"></path>
                    <rect width="18" height="18" x="3" y="4" rx="2"></rect>
                    <path d="M3 10h18"></path>
                  </svg>
                </div>
                <div class="text-sm font-medium text-slate-900">Upcoming Birthdays</div>
              </div>
              <div class="space-y-2">
                <div class="flex items-center justify-between text-xs p-2 rounded bg-slate-50">
                  <span>Alex D.</span>
                  <span class="text-slate-500">Tomorrow</span>
                </div>
                <div class="flex items-center justify-between text-xs p-2 rounded bg-slate-50">
                  <span>Jordan P.</span>
                  <span class="text-slate-500">in 3 days</span>
                </div>
              </div>
            </div>

            <div class="absolute left-[-20px] bottom-32 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl transform rotate-3 flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-green-400">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="m9 12 2 2 4-4"></path>
              </svg>
              <span class="text-sm font-medium">Automation Active</span>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-20 lg:mt-32 pt-10 border-t border-slate-100">
        <p class="text-center text-lg text-slate-500 mb-8 font-medium">Built for real teams. Designed for reliability, not noise.</p>
        <div class="flex flex-wrap justify-center gap-x-12 gap-y-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
          <div class="flex items-center gap-2 text-xl font-semibold text-slate-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4A2 2 0 0 0 13 20l7-4A2 2 0 0 0 21 16Z"></path>
              <path d="m3.3 7 8.7 5 8.7-5"></path>
              <path d="M12 22V12"></path>
            </svg>
            Acme Corp
          </div>
          <div class="flex items-center gap-2 text-xl font-semibold text-slate-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
              <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path>
              <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path>
              <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path>
            </svg>
            Layers
          </div>
          <div class="flex items-center gap-2 text-xl font-semibold text-slate-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
              <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"></path>
            </svg>
            Command
          </div>
          <div class="flex items-center gap-2 text-xl font-semibold text-slate-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
              <path d="M2 12h20"></path>
            </svg>
            GlobalNet
          </div>
          <div class="flex items-center gap-2 text-xl font-semibold text-slate-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
              <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path>
            </svg>
            BoltShift
          </div>
        </div>
      </div>
    </div>
  </header>

  <section id="problem" class="py-24 bg-slate-50">
    <div class="max-w-7xl mx-auto px-6">
      <div class="max-w-3xl mx-auto text-center mb-16">
        <h2 class="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight mb-4">Managing birthdays shouldn’t feel like work</h2>
        <p class="text-lg text-slate-600">Right now, birthday management is a broken process of manual reminders and last-minute scrambles.</p>
      </div>

      <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div class="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
              <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
              <path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742"></path>
              <path d="m2 2 20 20"></path>
              <path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05"></path>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Forgotten Reminders</h3>
          <p class="text-base text-slate-500">Someone forgets to remind the design team, and the day passes unnoticed.</p>
        </div>
        <div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div class="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
              <path d="M12 6v6l4 2"></path>
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Last Minute Scramble</h3>
          <p class="text-base text-slate-500">HR scrambles to get a card signed or a message sent at 4:55 PM.</p>
        </div>
        <div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div class="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-xl flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
              <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path>
              <path d="M14 2v5a1 1 0 0 0 1 1h5"></path>
              <path d="M8 13h2"></path>
              <path d="M14 13h2"></path>
              <path d="M8 17h2"></path>
              <path d="M14 17h2"></path>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Stale Spreadsheets</h3>
          <p class="text-base text-slate-500">Lists go out of date, new hires get missed, and dates are wrong.</p>
        </div>
        <div class="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div class="w-12 h-12 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M16 16s-1.5-2-4-2-4 2-4 2"></path>
              <line x1="9" x2="9.01" y1="9" y2="9"></line>
              <line x1="15" x2="15.01" y1="9" y2="9"></line>
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Generic Messages</h3>
          <p class="text-base text-slate-500">The \"happy birthday\" feels forced, late, or completely robotic.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="py-24 bg-white relative overflow-hidden">
    <div class="max-w-7xl mx-auto px-6">
      <div class="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <span class="text-indigo-600 font-semibold tracking-wide uppercase text-sm">The Solution</span>
          <h2 class="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight mt-3 mb-6">MomentOS turns birthdays into a system</h2>
          <p class="text-xl text-slate-600 mb-8">MomentOS is a lightweight platform that automates the care without losing the human touch.</p>
          <ul class="space-y-4">
            <li class="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-indigo-600 mt-0.5">
                <path d="M20 6 9 17l-5-5"></path>
              </svg>
              <span class="text-lg text-slate-700">Store people’s birthdays in one secure place.</span>
            </li>
            <li class="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-indigo-600 mt-0.5">
                <path d="M20 6 9 17l-5-5"></path>
              </svg>
              <span class="text-lg text-slate-700">Automatically send beautifully written emails on the right day.</span>
            </li>
            <li class="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-indigo-600 mt-0.5">
                <path d="M20 6 9 17l-5-5"></path>
              </svg>
              <span class="text-lg text-slate-700">Notify admins ahead of time so you're prepared.</span>
            </li>
            <li class="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-indigo-600 mt-0.5">
                <path d="M20 6 9 17l-5-5"></path>
              </svg>
              <span class="text-lg text-slate-700">Stay consistent without extra effort. No chasing, no stress.</span>
            </li>
          </ul>
        </div>
        <div class="relative">
          <div class="absolute inset-0 bg-indigo-500 rounded-3xl rotate-3 opacity-10"></div>
          <div class="bg-slate-900 rounded-3xl p-8 shadow-2xl relative">
            <div class="flex items-center gap-2 mb-6 border-b border-slate-700 pb-4">
              <div class="w-3 h-3 rounded-full bg-red-500"></div>
              <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div class="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div class="space-y-6">
              <div class="flex items-center justify-between text-slate-400 text-sm font-mono">
                <span>Status: <span class="text-green-400">Active</span></span>
                <span>Timezone: EST</span>
              </div>
              <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div class="flex items-center gap-4 mb-3">
                  <div class="w-8 h-8 rounded bg-indigo-500 flex items-center justify-center text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
                      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path>
                      <path d="m21.854 2.147-10.94 10.939"></path>
                    </svg>
                  </div>
                  <div class="text-slate-200 font-medium">Auto-Send Log</div>
                </div>
                <div class="space-y-2 font-mono text-xs text-slate-400">
                  <div class="flex justify-between"><span>&gt; Sending to alex@company.com...</span><span class="text-green-400">Sent</span></div>
                  <div class="flex justify-between"><span>&gt; Sending to jamie@company.com...</span><span class="text-green-400">Sent</span></div>
                  <div class="flex justify-between"><span>&gt; Next scheduled: 24h</span><span class="text-blue-400">Queued</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="bg-slate-50/50 border-slate-100 border-t pt-24 pb-24" id="how-it-works">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center mb-16">
        <span class="text-indigo-600 font-semibold uppercase text-xs tracking-wider">Platform</span>
        <h2 class="sm:text-4xl text-3xl font-semibold text-slate-900 tracking-tight mt-2">Everything you need to automate joy</h2>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <div class="group bg-white rounded-3xl p-2 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300">
          <div class="bg-gradient-to-br from-slate-50 to-indigo-50/40 rounded-2xl h-64 overflow-hidden relative flex items-center justify-center">
            <div class="absolute inset-x-12 top-10 bottom-0 bg-white rounded-t-xl border border-slate-200 shadow-lg flex flex-col p-5 space-y-4">
              <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                <div class="h-2 w-20 bg-slate-100 rounded-full"></div>
                <div class="h-2 w-8 bg-slate-100 rounded-full"></div>
              </div>
              <div class="space-y-3">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-semibold">JD</div>
                  <div class="flex-1 space-y-1.5">
                    <div class="h-2 w-24 bg-slate-200 rounded-full"></div>
                    <div class="h-1.5 w-16 bg-slate-100 rounded-full"></div>
                  </div>
                  <div class="w-12 h-5 rounded-full bg-green-50 border border-green-100"></div>
                </div>
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-semibold">AS</div>
                  <div class="flex-1 space-y-1.5">
                    <div class="h-2 w-20 bg-slate-200 rounded-full"></div>
                    <div class="h-1.5 w-14 bg-slate-100 rounded-full"></div>
                  </div>
                  <div class="w-12 h-5 rounded-full bg-green-50 border border-green-100"></div>
                </div>
                <div class="flex items-center gap-3 opacity-60">
                  <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold">MR</div>
                  <div class="flex-1 space-y-1.5">
                    <div class="h-2 w-28 bg-slate-200 rounded-full"></div>
                    <div class="h-1.5 w-12 bg-slate-100 rounded-full"></div>
                  </div>
                  <div class="w-12 h-5 rounded-full bg-slate-50 border border-slate-100"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="p-8">
            <h3 class="text-xl font-semibold text-slate-900 mb-2">Centralized People Data</h3>
            <p class="text-slate-500 leading-relaxed">Import from CSV, connect your HRIS, or add manually. We keep everything organized and validate dates automatically.</p>
          </div>
        </div>

        <div class="group bg-white rounded-3xl p-2 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300">
          <div class="bg-gradient-to-br from-slate-50 to-purple-50/40 rounded-2xl h-64 overflow-hidden relative flex items-center justify-center">
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden transform group-hover:-translate-y-1 transition-transform duration-500">
                <div class="bg-slate-50 border-b border-slate-100 p-3 flex gap-1.5">
                  <div class="w-2.5 h-2.5 rounded-full bg-slate-200"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-slate-200"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-slate-200"></div>
                </div>
                <div class="p-5 space-y-4">
                  <div class="space-y-2">
                    <div class="h-2 w-10 bg-slate-200 rounded-full"></div>
                    <div class="h-9 w-full bg-slate-50 rounded-lg border border-slate-100 flex items-center px-3 text-xs text-slate-400 shadow-sm">
                      Happy Birthday, <span class="text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded mx-1.5 font-medium">{name}</span>!
                    </div>
                  </div>
                  <div class="space-y-2">
                    <div class="h-2 w-16 bg-slate-200 rounded-full"></div>
                    <div class="h-20 w-full bg-slate-50 rounded-lg border border-slate-100 p-3 shadow-sm">
                      <div class="h-2 w-full bg-slate-200 rounded-full mb-2.5"></div>
                      <div class="h-2 w-5/6 bg-slate-200 rounded-full mb-2.5"></div>
                      <div class="h-2 w-4/6 bg-slate-200 rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="p-8">
            <h3 class="text-xl font-semibold text-slate-900 mb-2">Smart Templates</h3>
            <p class="text-slate-500 leading-relaxed">Create dynamic templates with variables. Our editor makes sure every message feels personal and on-brand.</p>
          </div>
        </div>

        <div class="group bg-white rounded-3xl p-2 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300">
          <div class="bg-gradient-to-br from-slate-50 to-blue-50/40 rounded-2xl h-64 overflow-hidden relative flex items-center justify-center">
            <div class="relative w-full px-16">
              <div class="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2"></div>
              <div class="relative flex justify-between items-center z-10">
                <div class="flex flex-col items-center gap-3">
                  <div class="w-10 h-10 bg-white border border-slate-200 shadow-sm rounded-full flex items-center justify-center text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
                      <line x1="16" x2="16" y1="2" y2="6"></line>
                      <line x1="8" x2="8" y1="2" y2="6"></line>
                      <line x1="3" x2="21" y1="10" y2="10"></line>
                    </svg>
                  </div>
                  <div class="bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-sm text-[10px] font-semibold uppercase tracking-wide text-slate-500">Day 0</div>
                </div>
                <div class="flex flex-col items-center gap-3">
                  <div class="w-12 h-12 bg-indigo-600 shadow-indigo-200 shadow-lg rounded-full flex items-center justify-center text-white transform scale-110">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                  </div>
                  <div class="bg-slate-900 px-3 py-1 rounded-full shadow-lg text-xs font-medium text-white">9:00 AM</div>
                </div>
                <div class="flex flex-col items-center gap-3">
                  <div class="w-10 h-10 bg-white border border-slate-200 shadow-sm rounded-full flex items-center justify-center text-green-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                  </div>
                  <div class="bg-white px-2.5 py-1 rounded-full border border-slate-200 shadow-sm text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sent</div>
                </div>
              </div>
            </div>
          </div>
          <div class="p-8">
            <h3 class="text-xl font-semibold text-slate-900 mb-2">Precision Scheduling</h3>
            <p class="text-slate-500 leading-relaxed">We automatically calculate the perfect send time based on your organization's timezone settings.</p>
          </div>
        </div>

        <div class="group bg-white rounded-3xl p-2 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300">
          <div class="bg-gradient-to-br from-slate-50 to-orange-50/40 rounded-2xl h-64 overflow-hidden relative flex items-center justify-center">
            <div class="flex flex-col items-center gap-6 transform translate-y-3">
              <div class="relative z-10">
                <div class="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-lg flex items-center justify-center ring-4 ring-slate-50">
                  <div class="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"></path>
                    </svg>
                  </div>
                </div>
                <div class="absolute top-full left-1/2 w-px h-6 bg-slate-300 -translate-x-1/2 -z-10"></div>
                <div class="absolute top-[24px] left-1/2 w-[120px] h-px bg-slate-300 -translate-x-1/2 translate-y-6 -z-10"></div>
                <div class="absolute top-[24px] left-[calc(50%-60px)] w-px h-6 bg-slate-300 translate-y-6 -z-10"></div>
                <div class="absolute top-[24px] right-[calc(50%-60px)] w-px h-6 bg-slate-300 translate-y-6 -z-10"></div>
              </div>
              <div class="flex gap-8">
                <div class="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
                  <div class="flex text-sm font-semibold text-indigo-600 bg-indigo-50 w-full h-full items-center justify-center">SM</div>
                </div>
                <div class="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
                  <div class="w-full h-full bg-green-50 flex items-center justify-center text-green-600 font-semibold text-sm">DL</div>
                </div>
                <div class="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
                  <div class="w-full h-full bg-orange-50 flex items-center justify-center text-orange-600 font-semibold text-sm">RK</div>
                </div>
              </div>
            </div>
          </div>
          <div class="p-8">
            <h3 class="text-xl font-semibold text-slate-900 mb-2">Team Management</h3>
            <p class="text-slate-500 leading-relaxed">Manage admins, view permissions, and organize people into groups for department-specific messaging.</p>
          </div>
        </div>

        <div class="group bg-white rounded-3xl p-2 border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 md:col-span-2 flex flex-col lg:flex-row overflow-hidden">
          <div class="flex-1 p-8 md:p-12 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 border border-green-100 text-green-700 text-xs font-semibold mb-6 w-fit">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              99.9% Deliverability
            </div>
            <h3 class="text-2xl font-semibold text-slate-900 mb-3">Enterprise Reliability</h3>
            <p class="text-slate-500 leading-relaxed text-lg mb-8 max-w-lg">
              Our infrastructure is built to ensure your emails land in the inbox, not the spam folder. We monitor reputation constantly so you don't have to.
            </p>
            <div class="flex gap-8">
              <div class="flex flex-col">
                <span class="text-3xl font-semibold text-slate-900 tracking-tight">10k+</span>
                <span class="text-sm text-slate-500 font-medium mt-1">Messages Sent</span>
              </div>
              <div class="w-px h-12 bg-slate-200"></div>
              <div class="flex flex-col">
                <span class="text-3xl font-semibold text-slate-900 tracking-tight">0%</span>
                <span class="text-sm text-slate-500 font-medium mt-1">Downtime</span>
              </div>
            </div>
          </div>
          <div class="flex-1 bg-gradient-to-br from-slate-50 to-white relative min-h-[300px] flex items-center justify-center p-8 lg:border-l border-slate-100">
            <div class="relative w-full max-w-sm">
              <div class="absolute top-6 left-8 right-0 h-24 bg-white rounded-xl shadow-sm border border-slate-200 opacity-40 transform scale-95"></div>
              <div class="absolute top-3 left-4 right-4 h-24 bg-white rounded-xl shadow-md border border-slate-200 opacity-70 transform scale-98"></div>
              <div class="relative bg-white rounded-xl shadow-xl border border-slate-200 p-5 flex items-center gap-5 transform transition-transform group-hover:scale-105 duration-500">
                <div class="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"></path>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                    <path d="m16 19 2 2 4-4"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex justify-between items-start mb-1.5">
                    <span class="font-semibold text-slate-900 text-sm">Delivery Confirmed</span>
                    <span class="text-[10px] text-slate-400 font-medium bg-slate-50 px-1.5 py-0.5 rounded">Now</span>
                  </div>
                  <div class="text-sm text-slate-500 truncate">Successfully sent birthday wish to <span class="text-slate-700 font-medium">Alex Morgan</span>.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="bg-slate-50 pt-24 pb-24" id="features">
    <div class="max-w-7xl mx-auto px-6">
      <div class="mb-16">
        <h2 class="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight mb-4">Built for operations, not aesthetics alone</h2>
        <p class="text-xl text-slate-600">Powerful features designed to make you efficient.</p>
      </div>

      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div class="bg-white p-8 rounded-2xl border border-slate-200/60 hover:shadow-lg transition-shadow duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-indigo-600 mb-4">
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path>
          </svg>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Automated Emails</h3>
          <p class="text-slate-500">Set it once and let MomentOS handle daily sends automatically.</p>
        </div>
        <div class="bg-white p-8 rounded-2xl border border-slate-200/60 hover:shadow-lg transition-shadow duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-indigo-600 mb-4">
            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Preview &amp; Test Mode</h3>
          <p class="text-slate-500">See exactly what recipients will get. Test without spamming anyone.</p>
        </div>
        <div class="bg-white p-8 rounded-2xl border border-slate-200/60 hover:shadow-lg transition-shadow duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-indigo-600 mb-4">
            <path d="M8 2v4"></path>
            <path d="M16 2v4"></path>
            <rect width="18" height="18" x="3" y="4" rx="2"></rect>
            <path d="M3 10h18"></path>
            <path d="M8 14h.01"></path>
            <path d="M12 14h.01"></path>
            <path d="M16 14h.01"></path>
            <path d="M8 18h.01"></path>
            <path d="M12 18h.01"></path>
            <path d="M16 18h.01"></path>
          </svg>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Upcoming View</h3>
          <p class="text-slate-500">Know who’s celebrating in the next 7 or 30 days instantly.</p>
        </div>
        <div class="bg-white p-8 rounded-2xl border border-slate-200/60 hover:shadow-lg transition-shadow duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-indigo-600 mb-4">
            <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"></path>
          </svg>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Manual Send Option</h3>
          <p class="text-slate-500">Need to send early or re-send? Do it with one click.</p>
        </div>
        <div class="bg-white p-8 rounded-2xl border border-slate-200/60 hover:shadow-lg transition-shadow duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-indigo-600 mb-4">
            <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path>
            <path d="M14 2v5a1 1 0 0 0 1 1h5"></path>
            <path d="M10 9H8"></path>
            <path d="M16 13H8"></path>
            <path d="M16 17H8"></path>
          </svg>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Delivery Logs</h3>
          <p class="text-slate-500">Know what was sent, when, and to whom with full transparency.</p>
        </div>
        <div class="bg-white p-8 rounded-2xl border border-slate-200/60 hover:shadow-lg transition-shadow duration-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-8 h-8 text-indigo-600 mb-4">
            <rect width="20" height="8" x="2" y="2" rx="2" ry="2"></rect>
            <rect width="20" height="8" x="2" y="14" rx="2" ry="2"></rect>
            <line x1="6" x2="6.01" y1="6" y2="6"></line>
            <line x1="6" x2="6.01" y1="18" y2="18"></line>
          </svg>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">Self-Hosted Friendly</h3>
          <p class="text-slate-500">You own your data. Run it on your own infrastructure if you want.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="py-24 border-t border-slate-200">
    <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-20">
      <div>
        <h3 class="text-2xl font-semibold text-slate-900 tracking-tight mb-6">Who It’s For</h3>
        <p class="text-lg text-slate-600 mb-8">If you manage people, MomentOS fits.</p>
        <div class="space-y-4">
          <div class="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-indigo-500">
              <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"></path>
            </svg>
            <span class="font-medium text-slate-800">Churches and communities</span>
          </div>
          <div class="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-indigo-500">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
            </svg>
            <span class="font-medium text-slate-800">Startups and small teams</span>
          </div>
          <div class="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-indigo-500">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <path d="M16 3.128a4 4 0 0 1 0 7.744"></path>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
              <circle cx="9" cy="7" r="4"></circle>
            </svg>
            <span class="font-medium text-slate-800">HR and People Ops teams</span>
          </div>
          <div class="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-indigo-500">
              <path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"></path>
              <path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"></path>
              <path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"></path>
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
            <span class="font-medium text-slate-800">NGOs and nonprofits</span>
          </div>
        </div>
      </div>

      <div>
        <h3 class="text-2xl font-semibold text-slate-900 tracking-tight mb-6">Why MomentOS</h3>
        <p class="text-lg text-slate-600 mb-8">Designed for clarity and trust. MomentOS isn’t trying to be everything.</p>

        <div class="space-y-6">
          <div class="pl-6 border-l-2 border-slate-200">
            <h4 class="text-lg font-medium text-slate-900">No Bloated Features</h4>
            <p class="text-slate-500 mt-1">No social feeds, no unnecessary analytics, no gamification.</p>
          </div>
          <div class="pl-6 border-l-2 border-slate-200">
            <h4 class="text-lg font-medium text-slate-900">Do One Thing Well</h4>
            <p class="text-slate-500 mt-1">Just a reliable system that helps you show people you care, consistently.</p>
          </div>
        </div>

        <div class="mt-10 p-6 bg-slate-900 rounded-2xl text-white">
          <div class="flex items-center gap-3 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-green-400">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>
              <path d="m9 12 2 2 4-4"></path>
            </svg>
            <span class="text-lg font-semibold">Privacy &amp; Control</span>
          </div>
          <p class="text-slate-300 text-sm mb-4">Your data stays yours. Easy deletion, opt-out, and self-hosting supported.</p>
          <div class="text-sm font-medium text-white">Moments matter. Privacy does too.</div>
        </div>
      </div>
    </div>
  </section>

  <!-- <section class="py-28 bg-white relative overflow-hidden" id="pricing">
    <div class="absolute inset-0 bg-gradient-to-b from-slate-50 to-transparent"></div>
    <div class="max-w-7xl mx-auto px-6 relative z-10">
      <div class="max-w-3xl">
        <span class="text-indigo-600 font-semibold uppercase text-xs tracking-wider">Pricing</span>
        <h2 class="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight mt-2 mb-4">Simple pricing. Thoughtful moments.</h2>
        <p class="text-lg text-slate-600">MomentOS is built to be reliable, not complicated. Choose a plan that fits your team and grow at your own pace.</p>
      </div>

      <div class="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p class="text-sm text-slate-500">Save 2 months when you pay annually.</p>
        <div class="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 text-xs font-semibold text-slate-600">
          <button type="button" data-billing="monthly" class="rounded-full px-3 py-1.5 bg-slate-900 text-white">Monthly</button>
          <button type="button" data-billing="annual" class="rounded-full px-3 py-1.5">Annually</button>
        </div>
      </div>

      <div class="mt-8 grid lg:grid-cols-4 gap-6">
        <div class="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm hover:shadow-lg transition-shadow duration-300 flex flex-col">
          <h3 class="text-xl font-semibold text-slate-900">Free</h3>
          <p class="text-slate-500 mt-2">For small teams getting started</p>
          <div class="mt-6">
            <div class="text-3xl font-semibold text-slate-900">₦0 <span class="text-base font-medium text-slate-500">/ month</span></div>
          </div>
          <ul class="mt-6 space-y-3 text-slate-600 text-sm">
            <li>Up to 25 people</li>
            <li>Automated birthday emails</li>
            <li>Default email templates</li>
            <li>Upcoming birthdays view</li>
            <li>Manual send option</li>
            <li>Basic delivery logs</li>
          </ul>
          <p class="mt-6 text-xs text-slate-500">Best for: churches, small teams, communities</p>
          <a href="#" data-action="open-waitlist" class="mt-6 inline-flex items-center justify-center rounded-full border border-slate-200 text-slate-700 text-sm font-medium px-5 py-3 hover:bg-slate-50 transition-all">Get Started Free</a>
        </div>
        <div class="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm hover:shadow-lg transition-shadow duration-300 flex flex-col">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-semibold text-slate-900">Pro</h3>
            <span class="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full">1-month free trial</span>
          </div>
          <p class="text-slate-500 mt-2">For growing teams that want control</p>
          <div class="mt-6">
            <div
              class="text-3xl font-semibold text-slate-900"
              data-billing-price
              data-monthly="₦5,000 / month"
              data-annual="₦50,000 / year"
            >
              ₦5,000 / month
            </div>
            <div
              class="text-sm text-slate-500 mt-2"
              data-billing-note
              data-monthly=""
              data-annual="save ₦10,000 — 2 months free"
            >
            </div>
          </div>
          <ul class="mt-6 space-y-3 text-slate-600 text-sm">
            <li>Up to 500 people</li>
            <li>Custom email templates</li>
            <li>Preview &amp; test sends</li>
            <li>Timezone-aware delivery</li>
            <li>Configurable send time</li>
            <li>Full delivery logs &amp; CSV exports</li>
            <li>Manual resend &amp; retry</li>
            <li>Priority email support</li>
          </ul>
          <p class="mt-6 text-xs text-slate-500">Best for: startups, NGOs, People Ops teams</p>
          <a href="#" data-action="open-waitlist" class="mt-6 inline-flex items-center justify-center rounded-full bg-slate-900 text-white text-sm font-medium px-5 py-3 hover:bg-slate-800 transition-all">Start Free Trial</a>
        </div>

        <div class="bg-slate-900 rounded-3xl border border-slate-900 p-8 shadow-xl shadow-slate-900/20 text-white flex flex-col">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-semibold">Organization</h3>
            <span class="text-xs font-semibold text-white bg-white/10 border border-white/20 px-2 py-1 rounded-full">1-month free trial</span>
          </div>
          <p class="text-slate-300 mt-2">For teams that need reliability at scale</p>
          <div class="mt-6">
            <div
              class="text-3xl font-semibold"
              data-billing-price
              data-monthly="₦15,000 / month"
              data-annual="₦150,000 / year"
            >
              ₦15,000 / month
            </div>
            <div
              class="text-sm text-slate-300 mt-2"
              data-billing-note
              data-monthly=""
              data-annual="save ₦30,000 — 2 months free"
            >
            </div>
          </div>
          <ul class="mt-6 space-y-3 text-slate-200 text-sm">
            <li>Up to 2,500 people</li>
            <li>Unlimited templates</li>
            <li>Advanced delivery logs</li>
            <li>Admin reminders (upcoming birthdays)</li>
            <li>Bulk actions (delete, opt-out, export)</li>
            <li>Dedicated support</li>
            <li>Early access to new features</li>
          </ul>
          <p class="mt-6 text-xs text-slate-300">Best for: companies, large churches, institutions</p>
          <a href="#" data-action="open-waitlist" class="mt-6 inline-flex items-center justify-center rounded-full bg-white text-slate-900 text-sm font-medium px-5 py-3 hover:bg-slate-100 transition-all">Start Free Trial</a>
        </div>

        <div class="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm hover:shadow-lg transition-shadow duration-300 flex flex-col">
          <h3 class="text-xl font-semibold text-slate-900">Enterprise / Self-Hosted</h3>
          <p class="text-slate-500 mt-2">Custom pricing</p>
          <ul class="mt-6 space-y-3 text-slate-600 text-sm">
            <li>Unlimited people</li>
            <li>Self-hosted deployment</li>
            <li>Full data ownership</li>
            <li>SLA &amp; priority support</li>
            <li>Optional custom integrations</li>
          </ul>
          <a href="#" data-action="open-waitlist" class="mt-8 inline-flex items-center justify-center rounded-full border border-slate-200 text-slate-700 text-sm font-medium px-5 py-3 hover:bg-slate-50 transition-all">Contact Sales</a>
        </div>
      </div>

      <div class="mt-12 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div>
          <h4 class="text-sm font-semibold text-slate-900">No surprises</h4>
          <p class="text-sm text-slate-600">No setup fees · No hidden charges · Cancel anytime</p>
        </div>
        <span class="text-sm text-slate-500">Start free. Upgrade only when it feels right.</span>
      </div>
    </div>
  </section> -->

  <footer class="bg-slate-50 border-t border-slate-200 py-12">
    <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 bg-slate-900 rounded-md flex items-center justify-center text-white text-xs">M</div>
        <span class="text-sm font-semibold text-slate-900">MomentOS</span>
      </div>
      <div class="text-sm text-slate-500">© 2025 MomentOS. All rights reserved.</div>
    </div>
  </footer>
`;

export default function LandingPage({ onLogin, onRegister }: LandingPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const modal = container.querySelector<HTMLDivElement>('#waitlist-modal');
    const loginLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('[data-action="login"]')
    );
    const registerLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('[data-action="register"]')
    );
    const waitlistForm = container.querySelector<HTMLFormElement>(
      '#waitlist-form'
    );
    const waitlistAlert = container.querySelector<HTMLDivElement>(
      '#waitlist-alert'
    );
    const waitlistSuccess = container.querySelector<HTMLDivElement>(
      '#waitlist-success'
    );
    const billingButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-billing]')
    );
    const billingPrices = Array.from(
      container.querySelectorAll<HTMLElement>('[data-billing-price]')
    );
    const billingNotes = Array.from(
      container.querySelectorAll<HTMLElement>('[data-billing-note]')
    );
    const openWaitlistLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('[data-action="open-waitlist"]')
    );
    const closeWaitlistTargets = Array.from(
      container.querySelectorAll<HTMLElement>('[data-action="close-waitlist"]')
    );

    const handleLogin = (event: Event) => {
      event.preventDefault();
      onLogin();
    };

    const handleRegister = (event: Event) => {
      event.preventDefault();
      onRegister();
    };

    const openWaitlist = (event: Event) => {
      event.preventDefault();
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
      waitlistSuccess?.classList.add('hidden');
      waitlistForm?.classList.remove('hidden');
      waitlistAlert?.classList.add('hidden');
    };

    const closeWaitlist = (event: Event) => {
      event.preventDefault();
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
      waitlistSuccess?.classList.add('hidden');
      waitlistForm?.classList.remove('hidden');
      waitlistAlert?.classList.add('hidden');
    };

    const setBilling = (mode: 'monthly' | 'annual') => {
      billingButtons.forEach((button) => {
        const isActive = button.dataset.billing === mode;
        button.classList.toggle('bg-slate-900', isActive);
        button.classList.toggle('text-white', isActive);
      });
      billingPrices.forEach((price) => {
        const text = price.dataset[mode] || price.textContent || '';
        price.textContent = text;
      });
      billingNotes.forEach((note) => {
        const text = note.dataset[mode] || '';
        note.textContent = text;
      });
    };
    const handleBillingClick = (event: Event) => {
      const target = event.currentTarget as HTMLButtonElement | null;
      const mode = target?.dataset.billing === 'annual' ? 'annual' : 'monthly';
      setBilling(mode);
    };

    const showWaitlistAlert = (message: string, tone: 'success' | 'error') => {
      if (!waitlistAlert) {
        return;
      }
      waitlistAlert.textContent = message;
      waitlistAlert.classList.remove('hidden');
      waitlistAlert.classList.remove(
        'border-emerald-200',
        'bg-emerald-50',
        'text-emerald-700',
        'border-rose-200',
        'bg-rose-50',
        'text-rose-700'
      );
      if (tone === 'success') {
        waitlistAlert.classList.add(
          'border-emerald-200',
          'bg-emerald-50',
          'text-emerald-700'
        );
      } else {
        waitlistAlert.classList.add(
          'border-rose-200',
          'bg-rose-50',
          'text-rose-700'
        );
      }
    };

    loginLinks.forEach((link) => link.addEventListener('click', handleLogin));
    registerLinks.forEach((link) =>
      link.addEventListener('click', handleRegister)
    );
    openWaitlistLinks.forEach((link) =>
      link.addEventListener('click', openWaitlist)
    );
    closeWaitlistTargets.forEach((target) =>
      target.addEventListener('click', closeWaitlist)
    );
    billingButtons.forEach((button) => {
      button.addEventListener('click', handleBillingClick);
    });
    setBilling('monthly');

    const handleWaitlistSubmit = async (event: Event) => {
      event.preventDefault();
      if (!waitlistForm) {
        return;
      }
      if (waitlistForm.dataset.submitting === 'true') {
        return;
      }
      waitlistForm.dataset.submitting = 'true';
      const submitButton = waitlistForm.querySelector<HTMLButtonElement>(
        'button[type="submit"]'
      );
      const originalLabel = submitButton?.textContent || '';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Joining...';
      }
      const formData = new FormData(waitlistForm);
      const payload = {
        fullName: String(formData.get('fullName') || ''),
        email: String(formData.get('email') || ''),
        organization: String(formData.get('organization') || ''),
        role: String(formData.get('role') || ''),
        teamSize: String(formData.get('teamSize') || ''),
        country: String(formData.get('country') || ''),
      };

      try {
        const response = await fetch(`${API_URL}/waitlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(result?.error || 'Waitlist signup failed');
        }

        waitlistForm.reset();
        waitlistAlert?.classList.add('hidden');
        waitlistForm.classList.add('hidden');
        waitlistSuccess?.classList.remove('hidden');
      } catch (error: any) {
        showWaitlistAlert(error.message || 'Unable to join waitlist.', 'error');
      } finally {
        waitlistForm.dataset.submitting = 'false';
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalLabel || 'Join waitlist';
        }
      }
    };

    waitlistForm?.addEventListener('submit', handleWaitlistSubmit);

    return () => {
      loginLinks.forEach((link) =>
        link.removeEventListener('click', handleLogin)
      );
      registerLinks.forEach((link) =>
        link.removeEventListener('click', handleRegister)
      );
      openWaitlistLinks.forEach((link) =>
        link.removeEventListener('click', openWaitlist)
      );
      closeWaitlistTargets.forEach((target) =>
        target.removeEventListener('click', closeWaitlist)
      );
      billingButtons.forEach((button) => {
        button.removeEventListener('click', handleBillingClick);
      });
      waitlistForm?.removeEventListener('submit', handleWaitlistSubmit);
    };
  }, [onLogin, onRegister]);

  return (
    <div
      ref={containerRef}
      className="bg-white text-slate-600 antialiased selection:bg-indigo-100 selection:text-indigo-900"
      dangerouslySetInnerHTML={{ __html: landingMarkup }}
    />
  );
}
