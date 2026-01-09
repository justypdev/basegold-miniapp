'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { sdk } from '@farcaster/frame-sdk';
import { useAccount, useBalance, useReadContract, useWatchContractEvent, usePublicClient, useSignMessage, useConnect, useDisconnect } from 'wagmi';
import { 
  Transaction, 
  TransactionButton, 
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction 
} from '@coinbase/onchainkit/transaction';

import { encodeFunctionData, parseUnits, formatUnits, parseEther, parseAbiItem, createPublicClient, http, fallback } from 'viem';
import { base } from 'wagmi/chains';

// ============ SOUND SYSTEM ============

let audioContext: AudioContext | null = null;

function initAudio() {
  if (typeof window === 'undefined') return;
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function playSound(type: string, comboLevel: number = 1, soundEnabled: boolean = true) {
  if (!soundEnabled || typeof window === 'undefined') return;
  initAudio();
  if (!audioContext) return;
  
  const ctx = audioContext;
  const now = ctx.currentTime;
  
  if (type === 'click') {
    // Coin click - short bright ding
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.05);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  }
  
  else if (type === 'combo') {
    // Combo - rising pitch based on combo level
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    const baseFreq = 440 + (comboLevel * 100);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.1);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  }
  
  else if (type === 'megaCombo') {
    // Mega combo (5x+) - power chord
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now + i * 0.02);
      osc.stop(now + 0.3);
    });
  }
  
  else if (type === 'upgrade') {
    // Upgrade - success chime
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      gain.gain.setValueAtTime(0.2, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.2);
    });
  }
  
  else if (type === 'achievement') {
    // Achievement - fanfare
    const melody = [523, 659, 784, 1047, 784, 1047];
    melody.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.15, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.15);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.15);
    });
  }
  
  else if (type === 'cantAfford') {
    // Can't afford - error buzz
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  }
  
  else if (type === 'purchase') {
    // Purchase - ka-ching!
    const notes = [1047, 1319, 1568];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);
      gain.gain.setValueAtTime(0.25, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.2);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.2);
    });
  }
  
  else if (type === 'burn') {
    // Burn notification - whoosh + sizzle
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  }
}

// ============ RELIABLE PUBLIC CLIENT WITH FALLBACK RPCS ============

const reliableClient = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://base.llamarpc.com'),
    http('https://base-mainnet.public.blastapi.io'),
    http('https://1rpc.io/base'),
    http('https://mainnet.base.org'),
  ]),
});

// ============ CONTRACT ADDRESSES (Base Mainnet) ============

const BG_TOKEN = '0x36b712A629095234F2196BbB000D1b96C12Ce78e' as `0x${string}`;
const INSTANT_BURN = '0xF9dc5A103C5B09bfe71cF1Badcce362827b34BFE' as `0x${string}`;
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as `0x${string}`;
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as `0x${string}`;
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as `0x${string}`;
const INITIAL_SUPPLY = 10000;

// ============ SECURITY CONSTANTS ============

const MAX_CLICKS_PER_SECOND = 20;
const MIN_BURNS_FOR_LEADERBOARD = 1;
const VERIFICATION_POLL_INTERVAL = 2000; // Poll every 2 seconds
const VERIFICATION_MAX_ATTEMPTS = 30; // Max 60 seconds of polling

// ============ ABIs ============

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'totalSupply',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const INSTANT_BURN_ABI = [
  {
    name: 'buyAndBurn',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    name: 'getBurnStats',
    type: 'function',
    inputs: [],
    outputs: [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' }
    ],
    stateMutability: 'view',
  },
  {
    name: 'InstantBurn',
    type: 'event',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'ethAmount', type: 'uint256', indexed: false },
      { name: 'bgBurned', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
      { name: 'totalBurnedLifetime', type: 'uint256', indexed: false },
    ],
  },
] as const;

// ============ SHOP ITEMS (ETH prices) ============
// Effects are ONLY applied after on-chain verification

const SHOP_ITEMS = [
  {
    id: 'boost_2x',
    name: '⚡ 2x Power Boost',
    description: 'Double click power for 10 minutes',
    priceETH: '0.00015',
    priceUSD: '~$0.50',
    emoji: '⚡',
    effect: { type: 'boost' as const, multiplier: 2, duration: 600000 }
  },
  {
    id: 'time_warp',
    name: '⏰ Time Warp',
    description: 'Instantly collect 1 hour of passive gold',
    priceETH: '0.0003',
    priceUSD: '~$1.00',
    emoji: '⏰',
    effect: { type: 'instant_gold' as const, hours: 1 }
  },
  {
    id: 'diamond_pickaxe',
    name: '💎 Diamond Pickaxe',
    description: 'Permanent +10 gold per click',
    priceETH: '0.0006',
    priceUSD: '~$2.00',
    emoji: '💎',
    effect: { type: 'permanent_click' as const, amount: 10 }
  },
  {
    id: 'auto_miner',
    name: '🤖 Auto-Miner Bot',
    description: 'Permanent +100 gold per second',
    priceETH: '0.0015',
    priceUSD: '~$5.00',
    emoji: '🤖',
    effect: { type: 'permanent_passive' as const, amount: 100 }
  },
  {
    id: 'golden_crown',
    name: '👑 Golden Crown',
    description: 'Exclusive cosmetic + 15x combo max',
    priceETH: '0.001',
    priceUSD: '~$3.00',
    emoji: '👑',
    effect: { type: 'cosmetic' as const, maxCombo: 15 }
  },
  {
    id: 'burn_booster',
    name: '🔥 Burn Booster',
    description: '+5/click, +25/sec, 100% burns BG!',
    priceETH: '0.0003',
    priceUSD: '~$1.00',
    emoji: '🔥',
    effect: { type: 'burn_bonus' as const, clickAmount: 5, passiveAmount: 25 }
  },
];

// ============ UPGRADES ============

const INITIAL_UPGRADES = {
  pickaxe: { cost: 50, owned: 0, multiplier: 1.5, perClick: 1, perSec: 0, emoji: '⛏️', name: 'Better Pickaxe' },
  miner: { cost: 100, owned: 0, multiplier: 1.5, perClick: 0, perSec: 1, emoji: '👷', name: 'Hire Miner' },
  drill: { cost: 500, owned: 0, multiplier: 1.5, perClick: 0, perSec: 5, emoji: '🔧', name: 'Gold Drill' },
  excavator: { cost: 2000, owned: 0, multiplier: 1.5, perClick: 0, perSec: 20, emoji: '🚜', name: 'Excavator' },
  dynamite: { cost: 5000, owned: 0, multiplier: 1.5, perClick: 0, perSec: 50, emoji: '🧨', name: 'Dynamite' },
  goldmine: { cost: 20000, owned: 0, multiplier: 1.5, perClick: 0, perSec: 200, emoji: '🏔️', name: 'Gold Mine' },
};

// ============ TYPES ============

interface BurnEntry {
  address: string;
  totalBurned: number;
  burnCount: number;
}

interface OnChainPurchase {
  itemId: string;
  ethAmount: string;
  bgBurned: number;
  timestamp: number;
  txHash: string;
}

interface VerifiedPointsEntry {
  address: string;
  name: string;
  gold: number;
  totalClicks: number;
  burnCount: number;
  totalBurned: number;
  timestamp: number;
  verified: boolean;
}

// ============ HELPER: Match ETH amount to shop item ============

function matchEthToItem(ethAmount: string): typeof SHOP_ITEMS[0] | null {
  const eth = parseFloat(ethAmount);
  for (const item of SHOP_ITEMS) {
    const itemEth = parseFloat(item.priceETH);
    // Allow 5% tolerance for gas variations
    if (Math.abs(eth - itemEth) / itemEth < 0.05) {
      return item;
    }
  }
  return null;
}

// ============ HELPER: Calculate bonuses from verified purchases ============

interface ActiveBoost {
  multiplier: number;
  endTime: number;
  remaining: number;
}

interface VerifiedBonuses {
  bonusClick: number;
  bonusPassive: number;
  hasCrown: boolean;
  maxCombo: number;
  activeBoost: ActiveBoost | null;
  instantGoldPending: number;
  botCount: number;
}

function calculateVerifiedBonuses(purchases: OnChainPurchase[], currentTime: number): VerifiedBonuses {
  let bonusClick = 0;
  let bonusPassive = 0;
  let hasCrown = false;
  let maxCombo = 10;
  let activeBoost: ActiveBoost | null = null;
  let instantGoldPending = 0;
  let botCount = 0;

  purchases.forEach(purchase => {
    const item = matchEthToItem(purchase.ethAmount);
    if (!item) return;

    switch (item.effect.type) {
      case 'permanent_click':
        bonusClick += item.effect.amount || 10;
        break;
      case 'permanent_passive':
        bonusPassive += item.effect.amount || 100;
        botCount++; // Count Auto-Miner Bots
        break;
      case 'cosmetic':
        hasCrown = true;
        maxCombo = item.effect.maxCombo || 15;
        break;
      case 'boost':
        const boostEndTime = purchase.timestamp + (item.effect.duration || 600000);
        const remaining = boostEndTime - currentTime;
        if (remaining > 0) {
          // Keep the boost with most time remaining
          if (!activeBoost || remaining > activeBoost.remaining) {
            activeBoost = { 
              multiplier: item.effect.multiplier || 2, 
              endTime: boostEndTime,
              remaining 
            };
          }
        }
        break;
      case 'instant_gold':
        // Track for display, actual gold added when verified
        instantGoldPending++;
        break;
      case 'burn_bonus':
        // Burn Booster: gives both click and passive bonuses
        bonusClick += item.effect.clickAmount || 5;
        bonusPassive += item.effect.passiveAmount || 25;
        break;
    }
  });

  return { bonusClick, bonusPassive, hasCrown, maxCombo, activeBoost, instantGoldPending, botCount };
}

// ============ COMPONENTS ============

// Gold Particles Background
function GoldParticles() {
  const [particles, setParticles] = useState<Array<{id: number, left: number, size: number, duration: number, delay: number}>>([]);
  
  useEffect(() => {
    const count = window.innerWidth < 768 ? 15 : 25;
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: Math.random() * 4 + 2,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 20,
    }));
    setParticles(newParticles);
  }, []);
  
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full opacity-0"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)',
            animation: `globalFloat ${p.duration}s linear infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// Ambient Glow Background
function AmbientGlow() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        background: `
          radial-gradient(ellipse at 20% 20%, rgba(212, 175, 55, 0.03) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 80%, rgba(212, 175, 55, 0.03) 0%, transparent 50%),
          radial-gradient(ellipse at 50% 50%, rgba(212, 175, 55, 0.02) 0%, transparent 70%)
        `
      }}
    />
  );
}

// Mine Visualization Component
function MineVisualization({ upgrades, botCount = 0 }: { upgrades: typeof INITIAL_UPGRADES; botCount?: number }) {
  const totalUpgrades = Object.values(upgrades).reduce((sum, u) => sum + u.owned, 0) + botCount;
  
  if (totalUpgrades === 0) {
    return (
      <div className="mt-4 p-4 bg-gradient-to-b from-[#2a1a0a] to-[#1a0f05] rounded-xl border border-[#3d2817]">
        <div className="text-center text-sm text-[#D4AF37] mb-2">⛏️ Your Mine</div>
        <div className="text-center text-gray-500 text-xs py-4">
          Buy upgrades to build your mine!
        </div>
      </div>
    );
  }
  
  const level = Math.floor(totalUpgrades / 3) + 1;
  const levelNames = ['Starter', 'Basic', 'Improved', 'Advanced', 'Professional', 'Industrial', 'Mega', 'Ultimate', 'Legendary', 'Mythical'];
  const levelName = levelNames[Math.min(level - 1, levelNames.length - 1)];
  
  return (
    <div className="mt-4 p-3 bg-gradient-to-b from-[#2a1a0a] to-[#1a0f05] rounded-xl border border-[#3d2817] overflow-hidden">
      <div className="text-center text-sm text-[#D4AF37] mb-2">⛏️ {levelName} Mine (Lvl {level})</div>
      <div className="relative h-32 bg-gradient-to-b from-[#2a1a0a] via-[#1a0f05] to-[#0f0a03] rounded-lg overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 opacity-20" style={{
          background: `
            repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(60, 40, 20, 0.3) 20px, rgba(60, 40, 20, 0.3) 21px),
            repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(60, 40, 20, 0.2) 20px, rgba(60, 40, 20, 0.2) 21px)
          `
        }} />
        
        {/* Gold veins */}
        <div className="absolute inset-0">
          {Array.from({ length: Math.min(totalUpgrades * 2, 20) }).map((_, i) => (
            <div
              key={`vein-${i}`}
              className="absolute rounded-full"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: `${10 + Math.random() * 80}%`,
                width: `${6 + Math.random() * 6}px`,
                height: `${6 + Math.random() * 6}px`,
                background: 'radial-gradient(circle, #D4AF37 0%, #996515 70%, transparent 100%)',
                animation: `veinGlow 2s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
        
        {/* Pickaxes on wall */}
        <div className="absolute top-2 left-2 flex gap-1 flex-wrap max-w-[80px]">
          {Array.from({ length: Math.min(upgrades.pickaxe.owned, 8) }).map((_, i) => (
            <span key={`pick-${i}`} className="text-sm" style={{ animation: 'pickaxeSwing 1s ease-in-out infinite', animationDelay: `${i * 0.1}s` }}>⛏️</span>
          ))}
        </div>
        
        {/* Miners walking */}
        <div className="absolute bottom-6 left-0 right-0">
          {Array.from({ length: Math.min(upgrades.miner.owned, 5) }).map((_, i) => (
            <span 
              key={`miner-${i}`} 
              className="absolute text-lg"
              style={{ 
                bottom: `${i * 8}px`,
                animation: `minerWalk ${3 + i}s linear infinite`,
                animationDelay: `${i * 0.8}s`
              }}
            >👷</span>
          ))}
        </div>
        
        {/* Drills */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1">
          {Array.from({ length: Math.min(upgrades.drill.owned, 4) }).map((_, i) => (
            <span key={`drill-${i}`} className="text-lg" style={{ animation: 'drillSpin 0.5s linear infinite', animationDelay: `${i * 0.15}s` }}>🔧</span>
          ))}
        </div>
        
        {/* Excavators */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-2">
          {Array.from({ length: Math.min(upgrades.excavator.owned, 3) }).map((_, i) => (
            <span key={`exc-${i}`} className="text-xl" style={{ animation: 'excavatorDig 2s ease-in-out infinite', animationDelay: `${i * 0.5}s` }}>🚜</span>
          ))}
        </div>
        
        {/* Dynamite */}
        <div className="absolute top-1/2 left-1/3 flex gap-3">
          {Array.from({ length: Math.min(upgrades.dynamite.owned, 4) }).map((_, i) => (
            <span key={`dyn-${i}`} className="text-lg" style={{ animation: 'dynamiteExplode 3s ease-in-out infinite', animationDelay: `${i * 0.7}s` }}>🧨</span>
          ))}
        </div>
        
        {/* Gold mines */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {Array.from({ length: Math.min(upgrades.goldmine.owned, 3) }).map((_, i) => (
            <span key={`mine-${i}`} className="text-xl" style={{ animation: 'goldmineShine 3s ease-in-out infinite', animationDelay: `${i * 0.5}s` }}>🏔️</span>
          ))}
        </div>
        
        {/* Auto-Miner Bots (premium item) */}
        {botCount > 0 && (
          <div className="absolute bottom-2 right-4 flex gap-1">
            {Array.from({ length: Math.min(botCount, 5) }).map((_, i) => (
              <span 
                key={`bot-${i}`} 
                className="text-lg"
                style={{ 
                  animation: 'botWork 1.5s ease-in-out infinite',
                  animationDelay: `${i * 0.3}s`,
                  filter: 'drop-shadow(0 0 4px rgba(100, 200, 255, 0.6))'
                }}
              >🤖</span>
            ))}
          </div>
        )}
        
        {/* Floating gold particles */}
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: Math.min(Math.floor(Object.values(upgrades).reduce((s, u) => s + u.owned * u.perSec, 0) / 10) + totalUpgrades, 15) }).map((_, i) => (
            <div
              key={`particle-${i}`}
              className="absolute w-1 h-1 bg-[#D4AF37] rounded-full"
              style={{
                left: `${10 + Math.random() * 80}%`,
                bottom: '20px',
                animation: `floatParticle 4s ease-in-out infinite`,
                animationDelay: `${Math.random() * 4}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Ad Banner Component (A-ADS)
function AdBanner() {
  return (
    <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-xl">
      <div className="text-[10px] text-gray-500 text-center uppercase tracking-wider mb-2">Advertisement</div>
      <div className="bg-black/30 rounded-lg overflow-hidden min-h-[100px] flex items-center justify-center">
        <iframe 
          data-aa="2422886" 
          src="//acceptable.a-ads.com/2422886/?size=Adaptive"
          style={{ border: 0, padding: 0, width: '100%', height: '100px', overflow: 'hidden', display: 'block' }}
        />
      </div>
      <div className="text-[10px] text-center text-gray-600 mt-2">
        🔥 Ad revenue buys & burns $BG
      </div>
    </div>
  );
}

function BurnNotification({ burn, onComplete }: { burn: { amount: string; buyer: string }; onComplete: () => void }) {
  useEffect(() => {
    playSound('burn', 1, true); // Always play burn sound for notifications
    const timer = setTimeout(onComplete, 4000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-pulse">
      <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-3 rounded-xl shadow-2xl border border-orange-400">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔥</span>
          <div>
            <div className="text-white font-bold">{burn.amount} BG BURNED!</div>
            <div className="text-orange-200 text-xs">by {burn.buyer}</div>
          </div>
          <span className="text-3xl">🔥</span>
        </div>
      </div>
    </div>
  );
}

function VerificationStatus({ status, item }: { status: string; item: typeof SHOP_ITEMS[0] }) {
  return (
    <div className="p-4 bg-blue-500/20 border border-blue-500 rounded-xl">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
        <div>
          <div className="text-blue-400 font-medium">{status}</div>
          <div className="text-xs text-gray-400">{item.emoji} {item.name}</div>
        </div>
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============

export default function MinerGame() {
  const [isReady, setIsReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const sessionStartTime = useRef(Date.now());
  const clickTimestamps = useRef<number[]>([]);
  
  // Wallet
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const { data: ethBalance } = useBalance({ address });
  const { data: bgBalance } = useBalance({ address, token: BG_TOKEN });
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();

  // Contract reads
  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: BG_TOKEN,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  });

  const { data: deadBalance } = useReadContract({
    address: BG_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [DEAD_ADDRESS],
  });

  const { data: burnStats, refetch: refetchBurnStats } = useReadContract({
    address: INSTANT_BURN,
    abi: INSTANT_BURN_ABI,
    functionName: 'getBurnStats',
  });

  // ============ ON-CHAIN VERIFIED STATE ============
  
  const [verifiedPurchases, setVerifiedPurchases] = useState<OnChainPurchase[]>([]);
  const [userBurnCount, setUserBurnCount] = useState(0);
  const [userBurnAmount, setUserBurnAmount] = useState(0);
  const [loadingVerification, setLoadingVerification] = useState(true);
  
  // Purchase verification state
  const [pendingVerification, setPendingVerification] = useState<{
    item: typeof SHOP_ITEMS[0];
    startTime: number;
    initialBurnCount: number;
    status: string;
  } | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState<typeof SHOP_ITEMS[0] | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // ============ SESSION STATE ============
  
  const [gold, setGold] = useState(0);
  const [totalClicks, setTotalClicks] = useState(0);
  const [combo, setCombo] = useState(1);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [upgrades, setUpgrades] = useState(INITIAL_UPGRADES);
  const [appliedInstantGold, setAppliedInstantGold] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // UI state
  const [activeTab, setActiveTab] = useState<'game' | 'shop' | 'buy' | 'leaderboard' | 'stats'>('game');
  const [floatingTexts, setFloatingTexts] = useState<Array<{id: number, text: string, x: number, y: number}>>([]);
  const [selectedItem, setSelectedItem] = useState<typeof SHOP_ITEMS[0] | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string>('init');
  const [purchaseVerified, setPurchaseVerified] = useState(false);
  
  // Burn notifications
  const [burnNotifications, setBurnNotifications] = useState<Array<{ id: number; amount: string; buyer: string }>>([]);
  const [totalBurned, setTotalBurned] = useState(0);
  
  // Leaderboard state
  const [burnLeaderboard, setBurnLeaderboard] = useState<BurnEntry[]>([]);
  const [pointsLeaderboard, setPointsLeaderboard] = useState<VerifiedPointsEntry[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'burns' | 'points'>('burns');
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [submittingScore, setSubmittingScore] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [offlineEarnings, setOfflineEarnings] = useState<{ gold: number; minutes: number } | null>(null);

  // Update current time for boost calculations
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load sound preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSound = localStorage.getItem('basegold-sound');
      if (savedSound !== null) {
        setSoundEnabled(savedSound === 'true');
      }
    }
  }, []);

  // Toggle sound function
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('basegold-sound', String(newValue));
      if (newValue) playSound('click', 1, true);
      return newValue;
    });
  }, []);

  // ============ SESSION MANAGEMENT (ONE DEVICE PER WALLET) ============
  
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showSessionConflict, setShowSessionConflict] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<{ deviceInfo: string; lastHeartbeat: number } | null>(null);
  const [isKicked, setIsKicked] = useState(false);
  const sessionHeartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Get device info for session tracking
  const getDeviceInfo = () => {
    if (typeof window === 'undefined') return 'Unknown';
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS Device';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'Linux PC';
    return 'Unknown Device';
  };

  // Create session when wallet connects
  const createSession = useCallback(async (forceTakeover = false) => {
    if (!address) return false;
    
    setSessionError(null);
    
    try {
      const action = forceTakeover ? 'takeover' : 'create';
      
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          address,
          deviceInfo: getDeviceInfo(),
        }),
      });
      
      const data = await response.json();
      
      if (data.conflict && !forceTakeover) {
        // Another device is playing
        setConflictInfo({
          deviceInfo: data.existingSession.deviceInfo,
          lastHeartbeat: data.existingSession.lastHeartbeat,
        });
        setShowSessionConflict(true);
        return false;
      }
      
      if (data.success && data.sessionId) {
        setSessionId(data.sessionId);
        setShowSessionConflict(false);
        setConflictInfo(null);
        console.log('🎮 Session created:', data.sessionId.slice(0, 8));
        return true;
      }
      
      setSessionError(data.error || 'Failed to create session');
      return false;
      
    } catch (error: any) {
      setSessionError('Failed to create session');
      return false;
    }
  }, [address]);

  // Session heartbeat
  useEffect(() => {
    if (!sessionId || !address) return;
    
    const sendHeartbeat = async () => {
      try {
        const response = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'heartbeat',
            address,
            sessionId,
          }),
        });
        
        const data = await response.json();
        
        if (data.kicked) {
          // We've been kicked by another device
          setIsKicked(true);
          setSessionId(null);
          console.log('⚠️ Kicked by another device');
        }
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    };
    
    // Send heartbeat every 25 seconds
    sessionHeartbeatRef.current = setInterval(sendHeartbeat, 25000);
    
    // Also send initial heartbeat
    sendHeartbeat();
    
    return () => {
      if (sessionHeartbeatRef.current) {
        clearInterval(sessionHeartbeatRef.current);
      }
    };
  }, [sessionId, address]);

  // End session on disconnect
  useEffect(() => {
    if (!address && sessionId) {
      // Wallet disconnected, end session
      fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'end',
          address,
          sessionId,
        }),
      }).catch(() => {});
      setSessionId(null);
    }
  }, [address, sessionId]);

  // End session on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (sessionId && address) {
        navigator.sendBeacon('/api/session', JSON.stringify({
          action: 'end',
          address,
          sessionId,
        }));
      }
    };
    
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [sessionId, address]);

  // ============ SECURE GAME STATE PERSISTENCE (SERVER-SIDE) ============
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(false);
  const lastSaveTime = useRef(0);
  const hasLoadedGame = useRef(false);
  
  // Load game state from server when wallet connects AND session is created
  useEffect(() => {
    if (!address || !sessionId || hasLoadedGame.current) return;
    
    const loadGame = async () => {
      setIsLoadingGame(true);
      try {
        const response = await fetch(`/api/game?address=${address}`);
        const data = await response.json();
        
        if (data.gameState) {
          console.log('📂 Loading saved game from server for', address.slice(0, 6));
          
          // Restore state
          if (typeof data.gameState.gold === 'number') setGold(data.gameState.gold);
          if (typeof data.gameState.totalClicks === 'number') setTotalClicks(data.gameState.totalClicks);
          if (data.gameState.upgrades) setUpgrades(data.gameState.upgrades);
          if (Array.isArray(data.gameState.appliedInstantGold)) {
            setAppliedInstantGold(new Set(data.gameState.appliedInstantGold));
          }
          
          // Apply offline earnings (calculated server-side)
          if (data.offlineGold && data.offlineGold > 0) {
            setGold(prev => prev + data.offlineGold);
            console.log(`💰 Offline earnings: +${data.offlineGold} gold (${data.offlineMinutes} min)`);
            setOfflineEarnings({ gold: data.offlineGold, minutes: data.offlineMinutes });
            setTimeout(() => setOfflineEarnings(null), 5000);
          }
          
          hasLoadedGame.current = true;
        } else {
          console.log('🆕 New player, no saved game found');
          hasLoadedGame.current = true;
        }
      } catch (error) {
        console.error('Error loading game from server:', error);
        // Fall back to allowing play without save
        hasLoadedGame.current = true;
      }
      setIsLoadingGame(false);
    };
    
    loadGame();
  }, [address, sessionId]);

  // Reset hasLoadedGame when wallet disconnects
  useEffect(() => {
    if (!address) {
      hasLoadedGame.current = false;
      // Reset game state
      setGold(0);
      setTotalClicks(0);
      setUpgrades(INITIAL_UPGRADES);
      setAppliedInstantGold(new Set());
    }
  }, [address]);
  
  // Save game to server (no signature required, session validates identity)
  const saveGameToServer = useCallback(async () => {
    if (!address || !sessionId) {
      if (!sessionId) setSaveError('Session required - please reconnect wallet');
      return false;
    }
    
    // Check if kicked
    if (isKicked) {
      setSaveError('Session ended - another device is playing');
      return false;
    }
    
    // Rate limit saves to every 30 seconds minimum
    const now = Date.now();
    if (now - lastSaveTime.current < 30000) return false;
    
    setIsSaving(true);
    setSaveError(null);
    
    try {
      const timestamp = Date.now();
      
      const gameState = {
        gold,
        totalClicks,
        upgrades,
        appliedInstantGold: Array.from(appliedInstantGold),
        lastSaved: timestamp,
        goldPerSecond,
        totalPlayTime: timestamp - sessionStartTime.current,
        sessionStart: sessionStartTime.current,
        lastClickTimestamp: lastClickTime,
        clicksThisSession: totalClicks,
      };
      
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          gameState,
          sessionId,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.kicked) {
          setIsKicked(true);
          setSessionId(null);
          setSaveError('Session ended - another device took over');
          return false;
        }
        if (data.flagged) {
          setSaveError('⚠️ Suspicious activity detected');
          console.error('Anti-cheat flagged:', data.reason);
        } else {
          setSaveError(data.error || 'Save failed');
        }
        return false;
      }
      
      lastSaveTime.current = now;
      console.log('💾 Game saved to server');
      return true;
      
    } catch (error: any) {
      console.error('Error saving game:', error);
      setSaveError('Save failed');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [address, sessionId, isKicked, gold, totalClicks, upgrades, appliedInstantGold, lastClickTime]);
  
  // Auto-save reminder (prompts user to save periodically)
  const [showSaveReminder, setShowSaveReminder] = useState(false);
  
  useEffect(() => {
    if (!address || !isConnected) return;
    
    // Remind to save every 5 minutes if they have significant progress
    const interval = setInterval(() => {
      if (gold > 1000 && Date.now() - lastSaveTime.current > 5 * 60 * 1000) {
        setShowSaveReminder(true);
      }
    }, 60000);
    
    return () => clearInterval(interval);
  }, [address, isConnected, gold]);

  // Auto-save when a purchase is verified (bypass rate limit)
  useEffect(() => {
    if (purchaseVerified && address && sessionId) {
      // Reset rate limit to allow immediate save
      lastSaveTime.current = 0;
      saveGameToServer();
      setPurchaseVerified(false);
      console.log('💾 Auto-saved after purchase verification');
    }
  }, [purchaseVerified, address, sessionId, saveGameToServer]);

  // Calculate verified bonuses
  const verifiedBonuses = useMemo(() => 
    calculateVerifiedBonuses(verifiedPurchases, currentTime), 
    [verifiedPurchases, currentTime]
  );
  
  // Calculate base stats from upgrades
  const baseGoldPerClick = useMemo(() => {
    return 1 + Object.values(upgrades).reduce((sum, u) => sum + u.owned * u.perClick, 0);
  }, [upgrades]);
  
  const baseGoldPerSecond = useMemo(() => {
    return Object.values(upgrades).reduce((sum, u) => sum + u.owned * u.perSec, 0);
  }, [upgrades]);
  
  // Final values from on-chain data
  const goldPerClick = baseGoldPerClick + verifiedBonuses.bonusClick;
  const goldPerSecond = baseGoldPerSecond + verifiedBonuses.bonusPassive;
  const clickMultiplier = verifiedBonuses.activeBoost?.multiplier || 1;
  const boostEndTime = verifiedBonuses.activeBoost?.endTime || null;
  const boostRemaining = verifiedBonuses.activeBoost?.remaining || 0;
  const hasCrown = verifiedBonuses.hasCrown;
  const maxCombo = verifiedBonuses.maxCombo;

  // ============ FETCH ON-CHAIN PURCHASES ============
  
  const fetchVerifiedPurchases = useCallback(async (): Promise<OnChainPurchase[]> => {
    if (!address) {
      setLoadingVerification(false);
      return [];
    }
    
    try {
      const logs = await reliableClient.getLogs({
        address: INSTANT_BURN,
        event: parseAbiItem('event InstantBurn(address indexed buyer, uint256 ethAmount, uint256 bgBurned, uint256 timestamp, uint256 totalBurnedLifetime)'),
        args: { buyer: address },
        fromBlock: 'earliest',
        toBlock: 'latest',
      });

      const purchases: OnChainPurchase[] = [];
      let totalBurned = 0;

      logs.forEach((log: any) => {
        const ethAmount = formatUnits(log.args.ethAmount || 0n, 18);
        const bgBurned = Number(formatUnits(log.args.bgBurned || 0n, 18));
        const timestamp = Number(log.args.timestamp || 0) * 1000;
        const txHash = log.transactionHash;
        
        totalBurned += bgBurned;

        const matchingItem = matchEthToItem(ethAmount);
        if (matchingItem) {
          purchases.push({
            itemId: matchingItem.id,
            ethAmount,
            bgBurned,
            timestamp,
            txHash,
          });
        }
      });

      setVerifiedPurchases(purchases);
      setUserBurnCount(logs.length);
      setUserBurnAmount(totalBurned);
      setLoadingVerification(false);
      
      return purchases;
    } catch (error) {
      console.error('Error fetching verified purchases:', error);
      setLoadingVerification(false);
      return [];
    }
  }, [address]);

  // Initial fetch
  useEffect(() => {
    fetchVerifiedPurchases();
  }, [fetchVerifiedPurchases]);

  // ============ PURCHASE VERIFICATION POLLING ============
  
  useEffect(() => {
    if (!pendingVerification || !address) return;

    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      
      if (attempts > VERIFICATION_MAX_ATTEMPTS) {
        clearInterval(pollInterval);
        setVerificationError('Verification timed out. Please check your transaction on BaseScan.');
        setPendingVerification(null);
        return;
      }

      setPendingVerification(prev => prev ? {
        ...prev,
        status: `Verifying on blockchain... (${attempts}/${VERIFICATION_MAX_ATTEMPTS})`
      } : null);

      try {
        const purchases = await fetchVerifiedPurchases();
        
        // Check if we have more burns than before
        if (purchases.length > pendingVerification.initialBurnCount) {
          // Find the new purchase
          const newPurchase = purchases.find(p => 
            p.timestamp > pendingVerification.startTime - 60000 // Within last minute
          );

          if (newPurchase) {
            const verifiedItem = matchEthToItem(newPurchase.ethAmount);
            
            if (verifiedItem && verifiedItem.id === pendingVerification.item.id) {
              // SUCCESS! Purchase verified on-chain
              clearInterval(pollInterval);
              
              console.log('✅ Purchase verified on-chain:', verifiedItem.id, 'txHash:', newPurchase.txHash);
              
              // Apply instant gold if applicable
              if (verifiedItem.effect.type === 'instant_gold' && !appliedInstantGold.has(newPurchase.txHash)) {
                const instantGold = goldPerSecond * 3600 * (verifiedItem.effect.hours || 1);
                setGold(prev => prev + instantGold);
                setAppliedInstantGold(prev => new Set([...prev, newPurchase.txHash]));
              }
              
              setVerificationSuccess(verifiedItem);
              setPendingVerification(null);
              setSelectedItem(null);
              setPurchaseVerified(true); // Trigger auto-save
              playSound('achievement', 1, true); // Always play achievement sound
              
              setTimeout(() => setVerificationSuccess(null), 6000);
            }
          }
        }
      } catch (error) {
        console.error('Verification poll error:', error);
      }
    }, VERIFICATION_POLL_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [pendingVerification, address, fetchVerifiedPurchases, goldPerSecond, appliedInstantGold]);

  // ============ WATCH BURN EVENTS ============
  // DISABLED: Causes 429 rate limiting - burns detected via polling instead
  /*
  useWatchContractEvent({
    address: INSTANT_BURN,
    abi: INSTANT_BURN_ABI,
    eventName: 'InstantBurn',
    onLogs(logs) {
      logs.forEach((log: any) => {
        const bgBurned = formatUnits(log.args.bgBurned || 0n, 18);
        const buyerAddress = log.args.buyer as string;
        const buyerShort = buyerAddress?.slice(0, 6) + '...' + buyerAddress?.slice(-4);
        
        const id = Date.now();
        setBurnNotifications(prev => [...prev, { id, amount: parseFloat(bgBurned).toFixed(6), buyer: buyerShort }]);
        
        refetchSupply();
        refetchBurnStats();
      });
    },
  });
  */

  // ============ FETCH LEADERBOARDS ============
  
  const fetchBurnLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const logs = await reliableClient.getLogs({
        address: INSTANT_BURN,
        event: parseAbiItem('event InstantBurn(address indexed buyer, uint256 ethAmount, uint256 bgBurned, uint256 timestamp, uint256 totalBurnedLifetime)'),
        fromBlock: 'earliest',
        toBlock: 'latest',
      });

      const burnsByAddress: Record<string, { totalBurned: number; burnCount: number }> = {};
      
      logs.forEach((log: any) => {
        const buyer = log.args.buyer as string;
        const bgBurned = Number(formatUnits(log.args.bgBurned || 0n, 18));
        
        if (!burnsByAddress[buyer]) {
          burnsByAddress[buyer] = { totalBurned: 0, burnCount: 0 };
        }
        burnsByAddress[buyer].totalBurned += bgBurned;
        burnsByAddress[buyer].burnCount += 1;
      });

      const leaderboard: BurnEntry[] = Object.entries(burnsByAddress)
        .map(([address, data]) => ({ address, ...data }))
        .sort((a, b) => b.totalBurned - a.totalBurned)
        .slice(0, 50);

      setBurnLeaderboard(leaderboard);
    } catch (error) {
      console.error('Error fetching burn leaderboard:', error);
    }
    setLoadingLeaderboard(false);
  }, []);

  const loadPointsLeaderboard = useCallback(async () => {
    try {
      const response = await fetch('/api/leaderboard');
      const data = await response.json();
      
      if (data.leaderboard) {
        setPointsLeaderboard(data.leaderboard);
      }
    } catch (error) {
      console.error('Error fetching points leaderboard:', error);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      fetchBurnLeaderboard();
      loadPointsLeaderboard();
    }
  }, [activeTab, fetchBurnLeaderboard, loadPointsLeaderboard]);

  // ============ SERVER-SIDE SCORE SUBMISSION ============
  
  const submitVerifiedScore = useCallback(async () => {
    if (!address || !signMessageAsync || !sessionId) {
      setSubmitError('Session required - please reconnect wallet');
      return;
    }
    
    if (isKicked) {
      setSubmitError('Session ended - another device is playing');
      return;
    }
    
    setSubmitError(null);
    
    if (userBurnCount < MIN_BURNS_FOR_LEADERBOARD) {
      setSubmitError(`Must have at least ${MIN_BURNS_FOR_LEADERBOARD} verified burn(s). You have: ${userBurnCount}`);
      return;
    }

    setSubmittingScore(true);
    
    try {
      // First, save the game to ensure server has latest state
     await saveGameToServer();
      
      const timestamp = Date.now();
      const roundedGold = Math.floor(gold);
      const message = `BaseGold Leaderboard\nAddress: ${address}\nGold: ${roundedGold}\nClicks: ${totalClicks}\nTimestamp: ${timestamp}`;
      
      console.log('📝 Signing message:', message);
      const signature = await signMessageAsync({ message });
      console.log('✍️ Signature obtained:', signature.substring(0, 20) + '...');
      
      const name = playerName.trim() || address.slice(0, 6) + '...' + address.slice(-4);
      
      console.log('📤 Submitting to leaderboard:', { address, name, gold: roundedGold, totalClicks });
      const response = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          signature,
          message,
          name,
          gold: roundedGold,
          totalClicks,
          timestamp,
          sessionId,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.kicked) {
          setIsKicked(true);
          setSessionId(null);
          setSubmitError('Session ended - another device took over');
          return;
        }
        setSubmitError(data.error || 'Failed to submit score');
        return;
      }
      
      // Refresh leaderboard
      await loadPointsLeaderboard();
      
      playSound('achievement', 1, soundEnabled);
      alert(`✅ Score submitted! Rank: #${data.rank} 🏆`);
    } catch (error: any) {
      console.error('Error submitting score:', error);
      playSound('cantAfford', 1, soundEnabled);
      if (error.message?.includes('User rejected')) {
        setSubmitError('Signature cancelled');
      } else {
        setSubmitError(error.message || 'Failed to submit score');
      }
    }
    
    setSubmittingScore(false);
  }, [address, signMessageAsync, sessionId, isKicked, gold, totalClicks, userBurnCount, playerName, saveGameToServer, loadPointsLeaderboard, soundEnabled]);

  // ============ GAME LOGIC ============

  useEffect(() => {
    const init = async () => {
      // Try Farcaster SDK with a short timeout - don't block if not in Farcaster context
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000));
      
      try {
        await Promise.race([
          sdk.actions.ready(),
          timeoutPromise
        ]);
      } catch (e) {
        // Ignore SDK errors - app works without Farcaster
        console.log('Not in Farcaster context, continuing...');
      }
      
      setIsReady(true);
      sessionStartTime.current = Date.now();
    };
    init();
  }, []);

  useEffect(() => {
    const savedName = localStorage.getItem('basegold-player-name');
    if (savedName) setPlayerName(savedName);
  }, []);

  useEffect(() => {
    if (playerName) localStorage.setItem('basegold-player-name', playerName);
  }, [playerName]);

  // Passive income
  useEffect(() => {
    const interval = setInterval(() => {
      if (goldPerSecond > 0) setGold(prev => prev + goldPerSecond);
    }, 1000);
    return () => clearInterval(interval);
  }, [goldPerSecond]);

  // Calculate total burned
  useEffect(() => {
    if (totalSupply) {
      const supply = Number(formatUnits(totalSupply as bigint, 18));
      const dead = deadBalance ? Number(formatUnits(deadBalance as bigint, 18)) : 0;
      const burned = INITIAL_SUPPLY - supply + dead;
      setTotalBurned(burned);
    }
  }, [totalSupply, deadBalance]);

  // Refresh data
  useEffect(() => {
    const interval = setInterval(() => {
      refetchSupply();
      refetchBurnStats();
      fetchVerifiedPurchases();
   }, 60000); // Reduced from 15s to 60s to avoid 429 rate limiting
    return () => clearInterval(interval);
  }, [refetchSupply, refetchBurnStats, fetchVerifiedPurchases]);

  // Click handler with rate limiting
  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    
    clickTimestamps.current = clickTimestamps.current.filter(t => now - t < 1000);
    if (clickTimestamps.current.length >= MAX_CLICKS_PER_SECOND) return;
    clickTimestamps.current.push(now);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    let newCombo = now - lastClickTime < 500 ? Math.min(combo + 1, maxCombo) : 1;
    setCombo(newCombo);
    setLastClickTime(now);
    
    const earned = Math.floor(goldPerClick * clickMultiplier * newCombo);
    setGold(prev => prev + earned);
    setTotalClicks(prev => prev + 1);
    
    // Play sounds
    playSound('click', newCombo, soundEnabled);
    if (newCombo >= 5) {
      playSound('megaCombo', newCombo, soundEnabled);
    } else if (newCombo > 1) {
      playSound('combo', newCombo, soundEnabled);
    }
    
    const id = Date.now();
    setFloatingTexts(prev => [...prev, { id, text: `+${formatNumber(earned)}`, x, y }]);
    setTimeout(() => setFloatingTexts(prev => prev.filter(ft => ft.id !== id)), 1000);
  }, [combo, lastClickTime, goldPerClick, clickMultiplier, maxCombo, soundEnabled]);

  const buyUpgrade = (key: keyof typeof upgrades) => {
    const upgrade = upgrades[key];
    if (gold >= upgrade.cost) {
      playSound('upgrade', 1, soundEnabled);
      setGold(prev => prev - upgrade.cost);
      setUpgrades(prev => ({
        ...prev,
        [key]: { ...prev[key], owned: prev[key].owned + 1, cost: Math.floor(prev[key].cost * prev[key].multiplier) }
      }));
    } else {
      playSound('cantAfford', 1, soundEnabled);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return Math.floor(num).toString();
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const buildPurchaseCalls = (priceETH: string) => {
    return [{
      to: INSTANT_BURN,
      value: parseEther(priceETH),
      data: encodeFunctionData({
        abi: INSTANT_BURN_ABI,
        functionName: 'buyAndBurn',
        args: [],
      }),
    }];
  };

  // Start verification after transaction
  const startVerification = useCallback((item: typeof SHOP_ITEMS[0]) => {
    setPendingVerification({
      item,
      startTime: Date.now(),
      initialBurnCount: userBurnCount,
      status: 'Waiting for blockchain confirmation...',
    });
    setVerificationError(null);
  }, [userBurnCount]);

  // Parse burn stats
  const burnStatsArray = burnStats as [bigint, bigint, bigint] | undefined;
  const totalBurnCount = burnStatsArray ? Number(burnStatsArray[2]) : 0;

  // Count verified purchases
  const verifiedPurchaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    verifiedPurchases.forEach(p => {
      counts[p.itemId] = (counts[p.itemId] || 0) + 1;
    });
    return counts;
  }, [verifiedPurchases]);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">⛏️</div>
          <p className="text-[#D4AF37] text-xl">Loading BaseGold Miner...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white relative">
      {/* Background Effects */}
      <AmbientGlow />
      <GoldParticles />
      
      {/* Burn Notifications */}
      {burnNotifications.map(burn => (
        <BurnNotification
          key={burn.id}
          burn={burn}
          onComplete={() => setBurnNotifications(prev => prev.filter(b => b.id !== burn.id))}
        />
      ))}

      {/* Offline Earnings Notification */}
      {offlineEarnings && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-pulse">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 rounded-xl shadow-2xl border border-green-400">
            <div className="flex items-center gap-3">
              <span className="text-3xl">💰</span>
              <div>
                <div className="text-white font-bold">Welcome back!</div>
                <div className="text-green-200 text-sm">
                  +{formatNumber(offlineEarnings.gold)} gold earned while away ({offlineEarnings.minutes} min)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Selection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowWalletModal(false)}>
          <div className="bg-[#1A1A1A] border border-[#D4AF37]/30 rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🔗</div>
              <h2 className="text-xl font-bold text-[#D4AF37]">Connect Wallet</h2>
              <p className="text-gray-400 text-sm mt-1">Choose your wallet to continue</p>
            </div>
            
            <div className="space-y-3">
              {/* Check if we're on mobile */}
              {(() => {
                const isMobile = typeof window !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                const hasEthereum = typeof window !== 'undefined' && !!window.ethereum;
                const isInMetaMask = typeof window !== 'undefined' && window.ethereum?.isMetaMask;
                
                return (
                  <>
                    {/* MetaMask Option */}
                    {isMobile && !isInMetaMask ? (
                      // Mobile Safari/Chrome - Deep link to MetaMask app
                      <a
                        href={`https://metamask.app.link/dapp/${typeof window !== 'undefined' ? window.location.host + window.location.pathname : 'basegold-miniapp.vercel.app'}`}
                        className="w-full flex items-center gap-4 p-4 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 hover:border-orange-500/50 rounded-xl transition-all"
                      >
                        <span className="text-3xl">🦊</span>
                        <div className="text-left flex-1">
                          <div className="text-white font-medium">MetaMask</div>
                          <div className="text-xs text-orange-400">Open in MetaMask app</div>
                        </div>
                        <span className="text-orange-400">↗</span>
                      </a>
                    ) : (
                      // Desktop or already in MetaMask browser - use connector
                      connectors.filter(c => c.id === 'injected' || c.name.toLowerCase().includes('metamask')).map((connector) => (
                        <button
                          key={connector.uid}
                          onClick={() => {
                            connect({ connector });
                            setShowWalletModal(false);
                          }}
                          disabled={isConnecting}
                          className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-[#D4AF37]/10 border border-white/10 hover:border-[#D4AF37]/30 rounded-xl transition-all disabled:opacity-50"
                        >
                          <span className="text-3xl">🦊</span>
                          <div className="text-left flex-1">
                            <div className="text-white font-medium">MetaMask</div>
                            <div className="text-xs text-gray-500">{hasEthereum ? 'Connect now' : 'Browser extension'}</div>
                          </div>
                          <span className="text-gray-500">→</span>
                        </button>
                      ))
                    )}
                    
                    {/* Coinbase Wallet - works on both mobile and desktop */}
                    {connectors.filter(c => c.name.toLowerCase().includes('coinbase')).map((connector) => (
                      <button
                        key={connector.uid}
                        onClick={() => {
                          connect({ connector });
                          setShowWalletModal(false);
                        }}
                        disabled={isConnecting}
                        className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-[#D4AF37]/10 border border-white/10 hover:border-[#D4AF37]/30 rounded-xl transition-all disabled:opacity-50"
                      >
                        <span className="text-3xl">🔵</span>
                        <div className="text-left flex-1">
                          <div className="text-white font-medium">Coinbase Wallet</div>
                          <div className="text-xs text-gray-500">Smart Wallet or Extension</div>
                        </div>
                        <span className="text-gray-500">→</span>
                      </button>
                    ))}
                    
                    {/* Other connectors */}
                    {connectors.filter(c => 
                      !c.name.toLowerCase().includes('coinbase') && 
                      !c.name.toLowerCase().includes('metamask') &&
                      c.id !== 'injected'
                    ).map((connector) => (
                      <button
                        key={connector.uid}
                        onClick={() => {
                          connect({ connector });
                          setShowWalletModal(false);
                        }}
                        disabled={isConnecting}
                        className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-[#D4AF37]/10 border border-white/10 hover:border-[#D4AF37]/30 rounded-xl transition-all disabled:opacity-50"
                      >
                        <span className="text-3xl">👛</span>
                        <div className="text-left flex-1">
                          <div className="text-white font-medium">{connector.name}</div>
                          <div className="text-xs text-gray-500">Web3 Wallet</div>
                        </div>
                        <span className="text-gray-500">→</span>
                      </button>
                    ))}
                  </>
                );
              })()}
            </div>
            
            {/* Help text for mobile */}
            {typeof window !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.ethereum && (
              <div className="mt-4 p-3 bg-white/5 rounded-lg">
                <p className="text-xs text-gray-400 text-center">
                  📱 <strong className="text-gray-300">Mobile?</strong> Tap MetaMask to open the app. Your progress saves to your wallet address!
                </p>
              </div>
            )}
            
            <button
              onClick={() => setShowWalletModal(false)}
              className="w-full mt-4 py-3 text-gray-400 hover:text-white transition-all text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Session Conflict Modal */}
      {showSessionConflict && conflictInfo && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-yellow-500/50 rounded-2xl p-6 max-w-sm w-full">
            <div className="text-center">
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-yellow-400 mb-2">Session Active Elsewhere</h2>
              <p className="text-gray-400 text-sm mb-4">
                Another device is currently playing with this wallet:
              </p>
              <div className="bg-black/50 rounded-lg p-3 mb-4">
                <div className="text-white font-medium">{conflictInfo.deviceInfo}</div>
                <div className="text-xs text-gray-500">
                  Last active: {new Date(conflictInfo.lastHeartbeat).toLocaleTimeString()}
                </div>
              </div>
              <p className="text-yellow-300 text-xs mb-4">
                Only one device can play per wallet to prevent cheating.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowSessionConflict(false);
                    setConflictInfo(null);
                  }}
                  className="flex-1 py-2 bg-gray-700 text-white rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createSession(true)}
                  className="flex-1 py-2 bg-yellow-500 text-black rounded-lg font-medium"
                >
                  Take Over
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Taking over will end the session on the other device
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Kicked Overlay */}
      {isKicked && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-red-500/50 rounded-2xl p-6 max-w-sm w-full">
            <div className="text-center">
              <div className="text-5xl mb-4">🚫</div>
              <h2 className="text-xl font-bold text-red-400 mb-2">Session Ended</h2>
              <p className="text-gray-400 text-sm mb-4">
                Another device has taken over this wallet's session.
              </p>
              <p className="text-red-300 text-xs mb-4">
                Your progress since last save may be lost.
              </p>
              <button
                onClick={() => {
                  setIsKicked(false);
                  createSession(true);
                }}
                className="w-full py-3 bg-red-500 text-white rounded-lg font-medium"
              >
                Reclaim Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Required Banner (when connected but no session) */}
      {isConnected && !sessionId && !showSessionConflict && !isKicked && (
        <div className="fixed inset-0 bg-black/80 z-40 flex items-center justify-center p-4">
          <div className="bg-[#1A1A1A] border border-[#D4AF37]/50 rounded-2xl p-6 max-w-sm w-full">
            <div className="text-center">
              <div className="text-5xl mb-4">🔐</div>
              <h2 className="text-xl font-bold text-[#D4AF37] mb-2">Session Required</h2>
              <p className="text-gray-400 text-sm mb-4">
                Sign a message to start playing. This prevents cheating by ensuring only one device can play per wallet.
              </p>
              {sessionError && (
                <div className="mb-4 p-2 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
                  {sessionError}
                </div>
              )}
              <button
                onClick={() => createSession(false)}
                className="w-full py-3 bg-[#D4AF37] text-black rounded-lg font-bold"
              >
                🎮 Start Session
              </button>
              <p className="text-xs text-gray-500 mt-2">
                One device per wallet (no gas fee)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center p-3 border-b border-[#D4AF37]/20 relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">⛏️</span>
          <span className="text-sm font-bold text-[#D4AF37]">BASEGOLD MINER</span>
          {hasCrown && <span>👑</span>}
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded ml-1">ON-CHAIN</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${
              soundEnabled 
                ? 'bg-[#D4AF37]/20 border-[#D4AF37]/50 hover:bg-[#D4AF37]/30' 
                : 'bg-white/10 border-white/20 opacity-50'
            }`}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
          
          {/* Custom Wallet Connection */}
          {isConnected ? (
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg hover:bg-[#D4AF37]/20 transition-all">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#996515] flex items-center justify-center text-[10px] font-bold text-black">
                  {address?.slice(2, 4).toUpperCase()}
                </div>
                <span className="text-xs text-[#D4AF37] font-medium">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
                <span className="text-gray-500 text-xs">▼</span>
              </button>
              {/* Dropdown */}
              <div className="absolute right-0 top-full mt-1 w-48 bg-[#1A1A1A] border border-[#D4AF37]/30 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="p-2 border-b border-white/10">
                  <div className="text-xs text-gray-400">Connected</div>
                  <div className="text-sm text-white font-mono">{address?.slice(0, 10)}...{address?.slice(-6)}</div>
                </div>
                <button
                  onClick={() => disconnect()}
                  className="w-full px-4 py-3 text-left text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-2 rounded-b-lg"
                >
                  <span>🚪</span>
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowWalletModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#996515] text-black font-bold text-sm rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/20 transition-all"
            >
              Connect
            </button>
          )}
        </div>
      </header>

      {/* Burn Ticker */}
      <div className="bg-gradient-to-r from-red-900/20 via-orange-900/20 to-red-900/20 border-b border-orange-500/20 py-2 px-4">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-base animate-pulse drop-shadow-lg">🔥</span>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total Burned</div>
              <div className="text-orange-400 font-bold font-mono text-sm">{totalBurned.toFixed(4)} BG</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Circulating</div>
            <div className="text-[#D4AF37] font-mono text-sm">{(INITIAL_SUPPLY - totalBurned).toFixed(2)} / 10,000</div>
          </div>
        </div>
      </div>

      {/* Balances */}
      <div className="bg-gradient-to-r from-[#D4AF37]/10 via-[#996515]/5 to-[#D4AF37]/10 border-b border-[#D4AF37]/20 py-3 px-4">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] flex items-center justify-center text-[#996515] font-bold text-sm border-2 border-[#996515] shadow-lg shadow-[#D4AF37]/20">BG</div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Your BaseGold</div>
              <div className="text-xl font-bold text-[#D4AF37] font-mono">
                {isConnected && bgBalance ? parseFloat(bgBalance.formatted).toFixed(4) : '0.0000'}
              </div>
            </div>
          </div>
          <button onClick={() => setActiveTab('buy')} className="px-5 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#996515] text-black font-bold text-sm rounded-xl hover:shadow-lg hover:shadow-[#D4AF37]/30 transition-all flex items-center gap-1.5">
            <span>🛒</span>
            <span>Buy BG</span>
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-r from-[#627EEA]/5 via-transparent to-[#627EEA]/5 border-b border-white/10 py-2 px-4">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#627EEA] to-[#3C4C8C] flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-[#627EEA]/20">Ξ</div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Your ETH</div>
              <div className="text-base font-bold text-white font-mono">
                {isConnected && ethBalance ? parseFloat(ethBalance.formatted).toFixed(4) : '0.0000'}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <a 
              href="https://pay.coinbase.com/buy/select-asset?appId=base" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="h-9 px-4 bg-[#627EEA] text-white font-semibold text-xs rounded-lg hover:bg-[#5470D8] transition-all flex items-center gap-1.5"
            >
              <span>💳</span>
              <span>Fund</span>
            </a>
            <a 
              href="https://relay.link/bridge/base" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="h-9 px-4 bg-white/5 border border-white/20 text-gray-300 font-semibold text-xs rounded-lg hover:bg-white/10 hover:border-white/30 hover:text-white transition-all flex items-center gap-1.5"
            >
              <span>🌉</span>
              <span>Bridge</span>
            </a>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 overflow-x-auto bg-black/20 backdrop-blur-sm">
        {[
          { id: 'game', label: '⛏️ Mine' },
          { id: 'shop', label: '💎 Shop' },
          { id: 'buy', label: '🛒 Buy BG' },
          { id: 'leaderboard', label: '🏆 Top' },
          { id: 'stats', label: '📊 Stats' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-3 text-xs font-semibold transition-all whitespace-nowrap px-2 ${activeTab === tab.id ? 'text-[#D4AF37] border-b-2 border-[#D4AF37] bg-[#D4AF37]/10' : 'text-gray-500 hover:text-gray-400'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto p-4 relative z-10">
        {/* ============ GAME TAB ============ */}
        {activeTab === 'game' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-1 mb-3 p-2 bg-gradient-to-b from-black/60 to-black/40 rounded-xl border border-white/10 backdrop-blur-sm">
              <div className="text-center p-2">
                <div className="text-lg font-bold text-[#D4AF37] font-mono">{formatNumber(gold)}</div>
                <div className="text-[9px] text-gray-500 uppercase tracking-widest">Gold</div>
              </div>
              <div className="text-center p-2 border-l border-white/10">
                <div className="text-lg font-bold text-white font-mono">{goldPerClick * clickMultiplier}</div>
                <div className="text-[9px] text-gray-500 uppercase tracking-widest">Per Click</div>
              </div>
              <div className="text-center p-2 border-l border-white/10">
                <div className="text-lg font-bold text-white font-mono">{formatNumber(goldPerSecond)}</div>
                <div className="text-[9px] text-gray-500 uppercase tracking-widest">Per Sec</div>
              </div>
              <div className="text-center p-2 border-l border-white/10">
                <div className={`text-lg font-bold font-mono ${combo >= 5 ? 'text-orange-400' : combo > 1 ? 'text-[#D4AF37]' : 'text-white'}`}>x{combo}</div>
                <div className="text-[9px] text-gray-500 uppercase tracking-widest">Combo</div>
              </div>
            </div>
            
            {/* Save Status & Button */}
            {isConnected && (
              <div className="mb-4">
                {/* Save Reminder Popup */}
                {showSaveReminder && (
                  <div className="mb-2 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-yellow-400 text-sm">💾 Remember to save your progress!</span>
                      <button
                        onClick={() => {
                          setShowSaveReminder(false);
                saveGameToServer();
                        }}
                        className="px-3 py-1 bg-yellow-500 text-black text-sm font-medium rounded"
                      >
                        Save Now
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Save Error */}
                {saveError && (
                  <div className="mb-2 p-2 bg-red-500/20 border border-red-500/50 rounded-lg text-center">
                    <span className="text-red-400 text-xs">{saveError}</span>
                  </div>
                )}
                
                {/* Save Button */}
                <div className="flex items-center justify-center gap-3">
                  <button
                   onClick={() => saveGameToServer()}
                    disabled={isSaving}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${
                      isSaving 
                        ? 'bg-gray-700/50 text-gray-400 border border-gray-600' 
                        : 'bg-gradient-to-r from-[#D4AF37]/20 to-[#996515]/20 border border-[#D4AF37]/40 text-[#D4AF37] hover:border-[#D4AF37]/60 hover:shadow-lg hover:shadow-[#D4AF37]/10'
                    }`}
                  >
                    {isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        💾 Save Progress
                      </>
                    )}
                  </button>
                  
                  {lastSaveTime.current > 0 && (
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      Saved {new Date(lastSaveTime.current).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                
                <p className="text-[10px] text-gray-500/80 text-center mt-1.5 flex items-center justify-center gap-1">
                  <span>🔐</span>
                  <span>Saved securely to server</span>
                </p>
              </div>
            )}
            {!isConnected && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                <span className="text-yellow-500 text-sm flex items-center justify-center gap-2">
                  ⚠️ Connect wallet to save progress
                </span>
                <p className="text-[10px] text-gray-500 mt-1">Your progress will be lost if you refresh</p>
              </div>
            )}

            {/* On-Chain Verified Bonuses */}
            {(verifiedBonuses.bonusClick > 0 || verifiedBonuses.bonusPassive > 0 || hasCrown || boostEndTime) && (
              <div className="mb-4 p-3 bg-gradient-to-b from-green-500/10 to-green-500/5 border border-green-500/30 rounded-xl">
                <div className="text-xs text-green-400 font-semibold mb-2 text-center flex items-center justify-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50"></span>
                  <span>On-Chain Verified Bonuses</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {verifiedBonuses.bonusClick > 0 && (
                    <div className="bg-green-500/20 rounded-lg p-2.5 text-center border border-green-500/20">
                      <div className="text-green-400 font-bold text-base">+{verifiedBonuses.bonusClick}</div>
                      <div className="text-green-300/80 text-[10px] uppercase tracking-wider">per click</div>
                    </div>
                  )}
                  {verifiedBonuses.bonusPassive > 0 && (
                    <div className="bg-green-500/20 rounded-lg p-2.5 text-center border border-green-500/20">
                      <div className="text-green-400 font-bold text-base">+{verifiedBonuses.bonusPassive}</div>
                      <div className="text-green-300/80 text-[10px] uppercase tracking-wider">per second</div>
                    </div>
                  )}
                </div>
                {boostEndTime && (
                  <div className="mt-2 p-2.5 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-lg text-center border border-yellow-500/30">
                    <div className="text-yellow-400 font-bold">⚡ {clickMultiplier}x BOOST</div>
                    <div className="text-yellow-300/80 text-[10px] uppercase tracking-wider">{formatTime(boostRemaining)} remaining</div>
                  </div>
                )}
              </div>
            )}

            {/* Gold Coin */}
            <div className="relative flex justify-center items-center h-56 mb-4">
              {floatingTexts.map(ft => (
                <div key={ft.id} className="absolute pointer-events-none font-bold text-[#D4AF37] text-xl" style={{ left: ft.x, top: ft.y, animation: 'floatUp 1s ease-out forwards' }}>
                  {ft.text}
                </div>
              ))}
              <button onClick={handleClick} className="w-44 h-44 rounded-full select-none bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] border-8 border-[#996515] shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_50px_rgba(212,175,55,0.3)] hover:shadow-[0_0_80px_rgba(212,175,55,0.5)] active:scale-95 transition-all duration-100 flex items-center justify-center text-4xl font-bold text-[#996515]">
                BG
              </button>
            </div>

            {/* Upgrades */}
            <h3 className="text-[#D4AF37] mb-2 text-sm font-semibold flex items-center gap-2">
              <span>⚡</span>
              <span>Upgrades</span>
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(upgrades).map(([key, upgrade]) => (
                <button
                  key={key}
                  onClick={() => buyUpgrade(key as keyof typeof upgrades)}
                  disabled={gold < upgrade.cost}
                  className={`p-2.5 rounded-xl border transition-all text-left text-sm ${gold >= upgrade.cost ? 'bg-gradient-to-br from-[#D4AF37]/15 to-[#D4AF37]/5 border-[#D4AF37]/40 hover:border-[#D4AF37]/60 hover:shadow-lg hover:shadow-[#D4AF37]/10' : 'bg-white/5 border-white/10 opacity-50'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-base">{upgrade.emoji}</span>
                    <span className="text-xs font-semibold text-white">{upgrade.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#D4AF37] text-xs font-mono">{formatNumber(upgrade.cost)}</span>
                    <span className="text-gray-400 text-[10px] bg-white/10 px-1.5 py-0.5 rounded">x{upgrade.owned}</span>
                  </div>
                </button>
              ))}
            </div>
            
            {/* Mine Visualization */}
            <MineVisualization upgrades={upgrades} botCount={verifiedBonuses.botCount} />
            
            {/* Ad Banner */}
            <AdBanner />
          </>
        )}

        {/* ============ SHOP TAB ============ */}
        {activeTab === 'shop' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">💎 Premium Shop</h2>
              <p className="text-xs text-gray-400">All purchases verified on Base blockchain 🔗</p>
            </div>

            {/* Verification in Progress */}
            {pendingVerification && (
              <div className="mb-4">
                <VerificationStatus status={pendingVerification.status} item={pendingVerification.item} />
              </div>
            )}

            {/* Verification Success */}
            {verificationSuccess && (
              <div className="mb-4 p-4 bg-green-500/20 border-2 border-green-500 rounded-xl text-center">
                <div className="text-3xl mb-2">✅</div>
                <div className="text-green-400 font-bold text-lg">Verified On-Chain!</div>
                <div className="mt-2 p-2 bg-black/30 rounded-lg">
                  <div className="text-white font-medium">{verificationSuccess.emoji} {verificationSuccess.name}</div>
                  <div className="text-green-300 text-sm mt-1">
                    {verificationSuccess.effect.type === 'permanent_click' && `+${verificationSuccess.effect.amount} gold per click`}
                    {verificationSuccess.effect.type === 'permanent_passive' && `+${verificationSuccess.effect.amount} gold per second`}
                    {verificationSuccess.effect.type === 'boost' && `${verificationSuccess.effect.multiplier}x boost for ${(verificationSuccess.effect.duration || 0) / 60000} min`}
                    {verificationSuccess.effect.type === 'instant_gold' && `+${verificationSuccess.effect.hours} hour(s) of gold`}
                    {verificationSuccess.effect.type === 'cosmetic' && `Crown unlocked!`}
                    {verificationSuccess.effect.type === 'burn_bonus' && `+${verificationSuccess.effect.clickAmount}/click, +${verificationSuccess.effect.passiveAmount}/sec + BG burned!`}
                  </div>
                </div>
                <div className="text-xs text-gray-400 mt-2">Transaction confirmed on Base</div>
                <div className="text-xs text-green-400 mt-1">✓ Progress auto-saved</div>
              </div>
            )}

            {/* Verification Error */}
            {verificationError && (
              <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-xl text-center">
                <div className="text-red-400">{verificationError}</div>
                <button onClick={() => setVerificationError(null)} className="mt-2 text-xs text-gray-400 hover:text-white">
                  Dismiss
                </button>
              </div>
            )}

            {/* Shop Items */}
            <div className="space-y-2">
              {SHOP_ITEMS.map(item => {
                const purchaseCount = verifiedPurchaseCounts[item.id] || 0;
                const isDisabled = !!pendingVerification;
                
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => {
                        if (!isDisabled) {
                          setSelectedItem(selectedItem?.id === item.id ? null : item);
                          setTxStatus('init');
                          setTxError(null);
                        }
                      }}
                      disabled={isDisabled}
                      className={`w-full p-3 rounded-xl border transition-all text-left ${isDisabled ? 'opacity-50' : ''} ${selectedItem?.id === item.id ? 'bg-[#627EEA]/20 border-[#627EEA]' : 'bg-white/5 border-white/10 hover:border-[#D4AF37]/50'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{item.emoji}</span>
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2">
                              {item.name}
                              {purchaseCount > 0 && (
                                <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                  x{purchaseCount}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400">{item.description}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[#627EEA] font-bold">{item.priceETH} ETH</div>
                          <div className="text-xs text-gray-500">{item.priceUSD}</div>
                        </div>
                      </div>
                    </button>
                    
                    {selectedItem?.id === item.id && isConnected && !pendingVerification && (
                      <div className="mt-2 p-3 bg-black/50 rounded-lg space-y-3">
                        
                        {/* Show status based on transaction state */}
                        {txStatus === 'transactionPending' ? (
                          <>
                            {/* Transaction submitted - waiting for confirmation */}
                            <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-center">
                              <div className="flex items-center justify-center gap-2 mb-2">
                                <div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin"></div>
                                <span className="text-green-400 font-medium">Transaction Submitted!</span>
                              </div>
                              <div className="text-green-300 text-sm">Waiting for blockchain confirmation...</div>
                              <div className="text-gray-400 text-xs mt-2">This usually takes 1-3 seconds</div>
                            </div>
                            
                            {/* Close button (can't cancel on-chain tx) */}
                            <button
                              onClick={() => {
                                setSelectedItem(null);
                                setTxStatus('init');
                              }}
                              className="w-full py-2 bg-gray-700/50 border border-gray-600 text-gray-300 rounded-lg text-sm hover:bg-gray-600/50 transition-all"
                            >
                              Close
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="text-xs text-gray-400 text-center">
                              ⏱️ After purchase, we'll verify on-chain before applying effects
                            </div>
                            
                            {/* Show error if transaction failed */}
                            {txError && (
                              <div className="p-2 bg-red-500/20 border border-red-500/50 rounded-lg text-center">
                                <div className="text-red-400 text-sm">Transaction failed</div>
                                <div className="text-gray-400 text-xs mt-1">Please try again</div>
                              </div>
                            )}
                            
                            <Transaction
                              chainId={base.id}
                              calls={buildPurchaseCalls(item.priceETH)}
                              onSuccess={(response) => {
                                console.log('✅ Transaction success:', response);
                                setTxError(null);
                                setTxStatus('init');
                                startVerification(item);
                              }}
                              onError={(error) => {
                                console.error('❌ Transaction error:', error);
                                setTxError('Transaction was rejected or failed');
                                setTxStatus('init');
                              }}
                              onStatus={(status) => {
                                console.log('📝 Status:', status.statusName);
                                setTxStatus(status.statusName);
                                if (status.statusName === 'init') {
                                  setTxError(null);
                                }
                              }}
                            >
                              <TransactionButton 
                                text={`Pay ${item.priceETH} ETH & Burn BG 🔥`}
                                className="w-full py-3 rounded-lg font-bold bg-gradient-to-r from-orange-500 to-red-500 text-sm"
                              />
                              <TransactionStatus>
                                <TransactionStatusLabel />
                                <TransactionStatusAction />
                              </TransactionStatus>
                            </Transaction>
                            
                            {/* Cancel button - only when not pending */}
                            <button
                              onClick={() => {
                                setSelectedItem(null);
                                setTxError(null);
                                setTxStatus('init');
                              }}
                              className="w-full py-2 bg-gray-700/50 border border-gray-600 text-gray-300 rounded-lg text-sm hover:bg-gray-600/50 transition-all"
                            >
                              ✕ Cancel
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Manual Refresh Button */}
            {isConnected && (
              <div className="mt-4">
                <button
                  onClick={async () => {
                    setLoadingVerification(true);
                    await fetchVerifiedPurchases();
                    setLoadingVerification(false);
                  }}
                  disabled={loadingVerification}
                  className="w-full py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  {loadingVerification ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                      Checking...
                    </>
                  ) : (
                    <>
                      🔄 Check for Recent Purchases
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 text-center mt-1">
                  Click if a transaction completed but effects didn't apply
                </p>
              </div>
            )}

            {!isConnected && (
              <div className="mt-4 text-center">
                <p className="text-gray-400 text-sm mb-2">Connect wallet to purchase</p>
                <button
                  onClick={() => setShowWalletModal(true)}
                  className="px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#996515] text-black font-bold rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/20 transition-all"
                >
                  🔗 Connect Wallet
                </button>
              </div>
            )}

            {/* Security Info */}
            <div className="mt-6 p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
              <div className="text-xs text-green-400 font-medium mb-2">🔐 Security</div>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>• All purchases verified on Base blockchain</li>
                <li>• Effects only apply after on-chain confirmation</li>
                <li>• Cannot be manipulated or exploited</li>
              </ul>
            </div>
          </>
        )}

        {/* ============ BUY BG TAB ============ */}
        {activeTab === 'buy' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">🛒 Buy BaseGold</h2>
            </div>

            <div className="mb-4 p-4 bg-gradient-to-br from-[#D4AF37]/20 to-[#996515]/20 border border-[#D4AF37]/30 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] flex items-center justify-center text-[#996515] font-bold border-2 border-[#996515]">BG</div>
                  <div>
                    <div className="text-xs text-gray-400">Your Balance</div>
                    <div className="text-2xl font-bold text-[#D4AF37] font-mono">
                      {isConnected && bgBalance ? parseFloat(bgBalance.formatted).toFixed(4) : '0.0000'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <a href="https://aerodrome.finance/swap?from=eth&to=0x36b712A629095234F2196BbB000D1b96C12Ce78e" target="_blank" rel="noopener noreferrer" className="block p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-xl">🔵</div>
                    <div>
                      <div className="font-medium text-white">Aerodrome</div>
                      <div className="text-xs text-gray-400">Best liquidity</div>
                    </div>
                  </div>
                  <div className="text-blue-400 text-sm">Swap →</div>
                </div>
              </a>

              <a href="https://app.uniswap.org/swap?outputCurrency=0x36b712A629095234F2196BbB000D1b96C12Ce78e&chain=base" target="_blank" rel="noopener noreferrer" className="block p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl hover:bg-pink-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center text-xl">🦄</div>
                    <div>
                      <div className="font-medium text-white">Uniswap</div>
                      <div className="text-xs text-gray-400">Popular DEX</div>
                    </div>
                  </div>
                  <div className="text-pink-400 text-sm">Swap →</div>
                </div>
              </a>
            </div>

            <div className="mt-4 p-3 bg-white/5 rounded-lg">
              <div className="text-xs text-gray-400 mb-1">Contract:</div>
              <div className="flex items-center gap-2">
                <code className="text-xs text-[#D4AF37] font-mono flex-1 truncate">0x36b712A629095234F2196BbB000D1b96C12Ce78e</code>
                <button onClick={() => { navigator.clipboard.writeText('0x36b712A629095234F2196BbB000D1b96C12Ce78e'); }} className="px-2 py-1 bg-white/10 rounded text-xs">Copy</button>
              </div>
            </div>
          </>
        )}

        {/* ============ LEADERBOARD TAB ============ */}
        {activeTab === 'leaderboard' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">🏆 Leaderboards</h2>
            </div>

            <div className="flex gap-2 mb-4">
              <button onClick={() => setLeaderboardTab('burns')} className={`flex-1 py-2 rounded-lg font-medium text-sm ${leaderboardTab === 'burns' ? 'bg-orange-500/20 border border-orange-500 text-orange-400' : 'bg-white/5 border border-white/10 text-gray-400'}`}>
                🔥 Burners
              </button>
              <button onClick={() => setLeaderboardTab('points')} className={`flex-1 py-2 rounded-lg font-medium text-sm ${leaderboardTab === 'points' ? 'bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37]' : 'bg-white/5 border border-white/10 text-gray-400'}`}>
                ⛏️ Miners
              </button>
            </div>

            {leaderboardTab === 'burns' && (
              <div className="space-y-2">
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg text-center text-xs text-green-400">
                  ✓ 100% On-Chain
                </div>
                
                {loadingLeaderboard ? (
                  <div className="text-center py-8 text-gray-400">Loading...</div>
                ) : burnLeaderboard.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">No burns yet</div>
                ) : (
                  burnLeaderboard.slice(0, 10).map((entry, index) => (
                    <div key={entry.address} className={`flex justify-between items-center p-3 rounded-lg border ${entry.address.toLowerCase() === address?.toLowerCase() ? 'bg-orange-500/20 border-orange-500' : 'bg-white/5 border-white/10'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold w-8 ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        <div className="font-mono text-sm">{entry.address.slice(0, 6)}...{entry.address.slice(-4)}</div>
                      </div>
                      <div className="text-orange-400 font-bold">{entry.totalBurned.toFixed(6)} BG</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {leaderboardTab === 'points' && (
              <div className="space-y-2">
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-400">
                  Requires: {MIN_BURNS_FOR_LEADERBOARD}+ burn(s) + wallet signature
                </div>

                {isConnected && (
                  <div className="p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-300">Your Score:</span>
                      <span className="text-[#D4AF37] font-bold">{formatNumber(gold)}</span>
                    </div>
                    <div className="flex justify-between items-center mb-2 text-xs">
                      <span className="text-gray-400">Burns:</span>
                      <span className={userBurnCount >= MIN_BURNS_FOR_LEADERBOARD ? 'text-green-400' : 'text-red-400'}>
                        {userBurnCount} {userBurnCount >= MIN_BURNS_FOR_LEADERBOARD ? '✓' : '✗'}
                      </span>
                    </div>
                    
                    {submitError && <div className="mb-2 p-2 bg-red-500/20 rounded text-xs text-red-400">{submitError}</div>}
                    
                    <div className="flex gap-2">
                      <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value.slice(0, 20))} placeholder="Name" className="flex-1 bg-black/50 border border-white/20 rounded px-2 py-1 text-sm" />
                      <button onClick={submitVerifiedScore} disabled={submittingScore || userBurnCount < MIN_BURNS_FOR_LEADERBOARD} className={`px-4 py-1 rounded font-medium text-sm ${userBurnCount >= MIN_BURNS_FOR_LEADERBOARD ? 'bg-[#D4AF37] text-black' : 'bg-gray-600 text-gray-400'}`}>
                        {submittingScore ? '...' : '🔐 Submit'}
                      </button>
                    </div>
                  </div>
                )}

                {pointsLeaderboard.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">No scores yet</div>
                ) : (
                  pointsLeaderboard.slice(0, 10).map((entry, index) => (
                    <div key={entry.address} className={`flex justify-between items-center p-3 rounded-lg border ${entry.address.toLowerCase() === address?.toLowerCase() ? 'bg-[#D4AF37]/20 border-[#D4AF37]' : 'bg-white/5 border-white/10'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold w-8 ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        <div>
                          <div className="font-medium text-sm">{entry.name}</div>
                          <div className="text-xs text-gray-500">🔥 {entry.burnCount}</div>
                        </div>
                      </div>
                      <div className="text-[#D4AF37] font-bold">{formatNumber(entry.gold)}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* ============ STATS TAB ============ */}
        {activeTab === 'stats' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">📊 Stats</h2>
            </div>

            <div className="mb-6 p-6 bg-gradient-to-br from-orange-900/30 to-red-900/30 border border-orange-500/30 rounded-2xl text-center">
              <div className="text-5xl mb-2">🔥</div>
              <div className="text-3xl font-bold text-orange-400 font-mono">{totalBurned.toFixed(4)}</div>
              <div className="text-gray-400">BG Burned</div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-[#D4AF37]">{(INITIAL_SUPPLY - totalBurned).toFixed(2)}</div>
                <div className="text-xs text-gray-500">Circulating</div>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-orange-400">{((totalBurned / INITIAL_SUPPLY) * 100).toFixed(2)}%</div>
                <div className="text-xs text-gray-500">Burned</div>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-green-400">{Math.round(21000000 / (INITIAL_SUPPLY - totalBurned)).toLocaleString()}x</div>
                <div className="text-xs text-gray-500">vs Bitcoin</div>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-blue-400">{totalBurnCount}</div>
                <div className="text-xs text-gray-500">Total Burns</div>
              </div>
            </div>

            <div className="bg-white/5 p-4 rounded-xl">
              <h3 className="text-sm font-medium text-gray-300 mb-3">🔐 Security</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Shop purchases verified on-chain
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Effects only apply after blockchain confirmation
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Leaderboard requires wallet signature
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Click rate limited ({MAX_CLICKS_PER_SECOND} CPS max)
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <style jsx global>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-50px); }
        }
        
        @keyframes globalFloat {
          0% { opacity: 0; transform: translateY(100vh) rotate(0deg); }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { opacity: 0; transform: translateY(-100px) rotate(720deg); }
        }
        
        @keyframes veinGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        
        @keyframes pickaxeSwing {
          0%, 100% { transform: rotate(-10deg); }
          50% { transform: rotate(10deg); }
        }
        
        @keyframes minerWalk {
          0% { transform: translateX(-20px) scaleX(1); }
          45% { transform: translateX(calc(100vw - 60px)) scaleX(1); }
          50% { transform: translateX(calc(100vw - 60px)) scaleX(-1); }
          95% { transform: translateX(-20px) scaleX(-1); }
          100% { transform: translateX(-20px) scaleX(1); }
        }
        
        @keyframes drillSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes excavatorDig {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          25% { transform: rotate(-5deg) translateY(-3px); }
          50% { transform: rotate(5deg) translateY(2px); }
          75% { transform: rotate(-3deg) translateY(-1px); }
        }
        
        @keyframes dynamiteExplode {
          0%, 70%, 100% { transform: scale(1); filter: brightness(1); }
          75% { transform: scale(1.3); filter: brightness(2); }
          80% { transform: scale(0.9); filter: brightness(1.5); }
        }
        
        @keyframes goldmineShine {
          0%, 100% { filter: brightness(1) drop-shadow(0 0 5px rgba(212, 175, 55, 0.3)); }
          50% { filter: brightness(1.3) drop-shadow(0 0 15px rgba(212, 175, 55, 0.8)); }
        }
        
        @keyframes floatParticle {
          0% { opacity: 0; transform: translateY(0); }
          20% { opacity: 0.8; }
          80% { opacity: 0.8; }
          100% { opacity: 0; transform: translateY(-100px); }
        }
        
        @keyframes botWork {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-3px) rotate(-5deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-3px) rotate(5deg); }
        }
      `}</style>
    </div>
  );
}
