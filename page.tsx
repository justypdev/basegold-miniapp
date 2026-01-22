'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { sdk } from '@farcaster/frame-sdk';
import { useAppKit } from '@reown/appkit/react';
import { useAccount, useBalance, useReadContract, useWatchContractEvent, usePublicClient, useSignMessage, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';

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

const MAX_CLICKS_PER_SECOND = 15;
const MIN_BURNS_FOR_LEADERBOARD = 1;
const VERIFICATION_POLL_INTERVAL = 2000; // Poll every 2 seconds
const VERIFICATION_MAX_ATTEMPTS = 30; // Max 60 seconds of polling

// ============ ANTI-CHEAT SECURITY SYSTEM ============

const ANTI_CHEAT = {
  // Timing analysis
  MIN_CLICK_INTERVAL: 30, // Minimum ms between clicks (33 CPS max physically impossible)
  VARIANCE_THRESHOLD: 0.15, // Bots have <15% timing variance, humans have >25%
  PATTERN_WINDOW: 50, // Analyze last 50 clicks for patterns
  
  // Position analysis
  POSITION_VARIANCE_MIN: 5, // Minimum pixel variance in click positions
  
  // Mouse movement analysis
  MOUSE_MOVEMENT_REQUIRED: 10, // Minimum mouse movements per 50 clicks
  
  // Penalties - SOFTENED: Max 10% penalty, no bans
  BOT_PENALTY_MULTIPLIER: 0.1, // Suspected bots earn 10% gold (90% penalty)
  UNFOCUSED_PENALTY: 0.75, // Earn 75% when tab not focused (gentler)
  
  // Detection thresholds - SOFTENED
  SUSPICION_THRESHOLD: 5, // Flags needed to be marked suspicious (was 3)
  MAX_PENALTY_THRESHOLD: 15, // Flags needed for max penalty (was ban at 10)
  
  // Challenge system
  CHALLENGE_INTERVAL: 750, // Show challenge every N clicks at high speed (was 500)
  HIGH_SPEED_THRESHOLD: 18, // CPS threshold to trigger challenges (was 15)
};

interface AntiCheatState {
  clickIntervals: number[];
  clickPositions: Array<{x: number, y: number}>;
  mouseMovements: number;
  suspicionFlags: number;
  isTabFocused: boolean;
  lastAnalysis: number;
  isSuspicious: boolean;
  penaltyMultiplier: number;
  honeypotTriggered: boolean;
  clicksSinceChallenge: number;
  lastChallengeTime: number;
  challengesPassed: number;
  challengesFailed: number;
}

function analyzeClickPattern(intervals: number[]): { variance: number; isBotLike: boolean } {
  if (intervals.length < 10) return { variance: 1, isBotLike: false };
  
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const squaredDiffs = intervals.map(x => Math.pow(x - mean, 2));
  const variance = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / intervals.length) / mean;
  
  // Bots have very consistent timing (low variance)
  // Humans naturally have 25-50% variance
  const isBotLike = variance < ANTI_CHEAT.VARIANCE_THRESHOLD;
  
  return { variance, isBotLike };
}

function analyzeClickPositions(positions: Array<{x: number, y: number}>): boolean {
  if (positions.length < 10) return false;
  
  // Calculate position variance
  const xValues = positions.map(p => p.x);
  const yValues = positions.map(p => p.y);
  
  const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
  const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;
  
  const xVariance = Math.sqrt(xValues.map(x => Math.pow(x - xMean, 2)).reduce((a, b) => a + b, 0) / xValues.length);
  const yVariance = Math.sqrt(yValues.map(y => Math.pow(y - yMean, 2)).reduce((a, b) => a + b, 0) / yValues.length);
  
  // Bots click the exact same position, humans have natural variance
  return xVariance < ANTI_CHEAT.POSITION_VARIANCE_MIN && yVariance < ANTI_CHEAT.POSITION_VARIANCE_MIN;
}

// Generate a random challenge position
function generateChallengePosition(): { x: number; y: number } {
  // Random position within a 100px radius
  const angle = Math.random() * 2 * Math.PI;
  const radius = 20 + Math.random() * 60;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius
  };
}

// ============ BUY ETH BUTTON - Uses Coinbase CDP API for Base ETH ============

function BuyEthButton({ address, className }: { address?: string; className?: string }) {
  const [loading, setLoading] = useState(false);
  
  const handleBuyEth = async () => {
    if (!address) return;
    setLoading(true);
    
    // Fallback URL for Base ETH
    const fallbackUrl = `https://pay.coinbase.com/buy/select-asset?addresses=${encodeURIComponent(JSON.stringify({[address]: ["base"]}))}&assets=${encodeURIComponent(JSON.stringify(["ETH"]))}`;
    
    try {
      // Call our API to get a Coinbase session token
      const res = await fetch('/api/onramp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      
      const data = await res.json();
      
      // Use the URL from API response (either session token URL or fallback)
      const targetUrl = data.url || fallbackUrl;
      window.open(targetUrl, '_blank');
      
    } catch (err) {
      console.error('Onramp error:', err);
      // On error, use fallback URL
      window.open(fallbackUrl, '_blank');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <button
      onClick={handleBuyEth}
      disabled={!address || loading}
      className={className || "h-9 px-4 bg-[#0052FF] text-white font-semibold text-xs rounded-lg hover:bg-[#0040CC] transition-all flex items-center justify-center gap-1.5"}
    >
      {loading ? (
        <span className="animate-pulse">Loading...</span>
      ) : (
        <>
          <span>⊕</span>
          <span>Buy ETH</span>
        </>
      )}
    </button>
  );
}

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
  // ============ SEASON 1 ITEMS ============
  {
    id: 'boost_2x',
    name: '⚡ 2x Power Boost',
    description: 'Double click power for 10 minutes',
    priceETH: '0.00015',
    priceUSD: '~$0.50',
    emoji: '⚡',
    effect: { type: 'boost' as const, multiplier: 2, duration: 600000 },
    season: 1
  },
  {
    id: 'time_warp',
    name: '⏰ Time Warp',
    description: 'Instantly collect 1 hour of passive gold',
    priceETH: '0.0003',
    priceUSD: '~$1.00',
    emoji: '⏰',
    effect: { type: 'instant_gold' as const, hours: 1 },
    season: 1
  },
  {
    id: 'diamond_pickaxe',
    name: '💎 Diamond Pickaxe',
    description: 'Permanent +10 gold per click',
    priceETH: '0.0006',
    priceUSD: '~$2.00',
    emoji: '💎',
    effect: { type: 'permanent_click' as const, amount: 10 },
    season: 1
  },
  {
    id: 'auto_miner',
    name: '🤖 Auto-Miner Bot',
    description: 'Permanent +100 gold per second',
    priceETH: '0.0015',
    priceUSD: '~$5.00',
    emoji: '🤖',
    effect: { type: 'permanent_passive' as const, amount: 100 },
    season: 1
  },
  {
    id: 'golden_crown',
    name: '👑 Golden Crown',
    description: 'Exclusive cosmetic + 15x combo max',
    priceETH: '0.001',
    priceUSD: '~$3.00',
    emoji: '👑',
    effect: { type: 'cosmetic' as const, maxCombo: 15 },
    season: 1
  },
  {
    id: 'burn_booster',
    name: '🔥 Burn Booster',
    description: '+5/click, +25/sec, 100% burns BG!',
    priceETH: '0.00035',
    priceUSD: '~$1.15',
    emoji: '🔥',
    effect: { type: 'burn_bonus' as const, clickAmount: 5, passiveAmount: 25 },
    season: 1
  },
  
  // ============ 🆕 SEASON 2 EXCLUSIVE ITEMS ============
  {
    id: 'mega_boost_5x',
    name: '⚡ 5x MEGA BOOST',
    description: '5x ALL earnings for 5 minutes!',
    priceETH: '0.0012',
    priceUSD: '~$4.00',
    emoji: '⚡',
    effect: { type: 'boost' as const, multiplier: 5, duration: 300000 },
    season: 2,
    tag: 'NEW'
  },
  {
    id: 'second_mine',
    name: '🏔️ Second Mine',
    description: 'PERMANENT 2x multiplier on ALL earnings!',
    priceETH: '0.005',
    priceUSD: '~$15.00',
    emoji: '🏔️',
    effect: { type: 'global_multiplier' as const, multiplier: 2 },
    season: 2,
    tag: 'LEGENDARY'
  },
  {
    id: 'golden_goat',
    name: '🐐 Golden Goat',
    description: 'Premium cosmetic + 25x combo + auto-click!',
    priceETH: '0.003',
    priceUSD: '~$10.00',
    emoji: '🐐',
    effect: { type: 'golden_goat' as const, maxCombo: 25, autoClick: 2 },
    season: 2,
    tag: 'EPIC'
  },
  {
    id: 'lucky_nugget',
    name: '🍀 Lucky Nugget',
    description: '15% chance for 10x gold per click!',
    priceETH: '0.002',
    priceUSD: '~$6.00',
    emoji: '🍀',
    effect: { type: 'lucky' as const, chance: 0.15, multiplier: 10 },
    season: 2,
    tag: 'NEW'
  },
  {
    id: 'time_warp_pro',
    name: '⏰ Time Warp PRO',
    description: 'Instantly collect 8 HOURS of passive gold!',
    priceETH: '0.0022',
    priceUSD: '~$7.00',
    emoji: '⏰',
    effect: { type: 'instant_gold' as const, hours: 8 },
    season: 2,
    tag: 'NEW'
  },
  {
    id: 'diamond_mine',
    name: '💎 Diamond Mine',
    description: 'Permanent +500 gold per second!',
    priceETH: '0.004',
    priceUSD: '~$12.00',
    emoji: '💎',
    effect: { type: 'permanent_passive' as const, amount: 500 },
    season: 2,
    tag: 'EPIC'
  },
  {
    id: 'inferno_burn',
    name: '🔥 INFERNO BURN',
    description: '+25/click, +100/sec, MASSIVE BG burn!',
    priceETH: '0.0017',
    priceUSD: '~$5.50',
    emoji: '🔥',
    effect: { type: 'burn_bonus' as const, clickAmount: 25, passiveAmount: 100 },
    season: 2,
    tag: 'NEW'
  },
];

// ============ UPGRADES ============

const INITIAL_UPGRADES = {
  pickaxe: { cost: 50, owned: 0, multiplier: 1.5, perClick: 1, perSec: 0, emoji: '⛏️', name: 'Better Pickaxe', unlockLevel: 1 },
  miner: { cost: 100, owned: 0, multiplier: 1.5, perClick: 0, perSec: 1, emoji: '👷', name: 'Hire Miner', unlockLevel: 2 },
  drill: { cost: 500, owned: 0, multiplier: 1.5, perClick: 0, perSec: 5, emoji: '🔧', name: 'Gold Drill', unlockLevel: 5 },
  excavator: { cost: 2000, owned: 0, multiplier: 1.5, perClick: 0, perSec: 20, emoji: '🚜', name: 'Excavator', unlockLevel: 10 },
  dynamite: { cost: 5000, owned: 0, multiplier: 1.5, perClick: 0, perSec: 50, emoji: '🧨', name: 'Dynamite', unlockLevel: 15 },
  goldmine: { cost: 20000, owned: 0, multiplier: 1.5, perClick: 0, perSec: 200, emoji: '🏔️', name: 'Gold Mine', unlockLevel: 25 },
  // Strategic upgrades - add luck and multiplicative bonuses
  luckyStrike: { cost: 10000, owned: 0, multiplier: 1.6, perClick: 0, perSec: 0, emoji: '🍀', name: 'Lucky Strike', luckChance: 0.05, luckBonus: 3, unlockLevel: 20 },
  goldBoost: { cost: 25000, owned: 0, multiplier: 1.7, perClick: 0, perSec: 0, emoji: '✨', name: 'Gold Boost', boostPercent: 0.1, unlockLevel: 30 },
};

// ============ LEVEL SYSTEM ============

const LEVEL_THRESHOLDS = [
  0,        // Level 1
  100,      // Level 2
  300,      // Level 3
  600,      // Level 4
  1000,     // Level 5
  1500,     // Level 6
  2500,     // Level 7
  4000,     // Level 8
  6000,     // Level 9
  10000,    // Level 10
  15000,    // Level 11
  22000,    // Level 12
  32000,    // Level 13
  45000,    // Level 14
  65000,    // Level 15
  90000,    // Level 16
  125000,   // Level 17
  175000,   // Level 18
  250000,   // Level 19
  350000,   // Level 20
  500000,   // Level 21
  700000,   // Level 22
  1000000,  // Level 23
  1400000,  // Level 24
  2000000,  // Level 25
  2800000,  // Level 26
  4000000,  // Level 27
  5500000,  // Level 28
  7500000,  // Level 29
  10000000, // Level 30
  15000000, // Level 31
  25000000, // Level 32
  40000000, // Level 33
  60000000, // Level 34
  100000000,// Level 35
];

const LEVEL_TITLES = [
  'Novice Miner',      // 1
  'Apprentice',        // 2
  'Prospector',        // 3
  'Digger',            // 4
  'Excavator',         // 5
  'Tunneler',          // 6
  'Cave Explorer',     // 7
  'Vein Hunter',       // 8
  'Ore Seeker',        // 9
  'Gold Finder',       // 10
  'Rich Striker',      // 11
  'Deep Miner',        // 12
  'Shaft Master',      // 13
  'Bonanza Hunter',    // 14
  'Nugget King',       // 15
  'Mine Foreman',      // 16
  'Gold Baron',        // 17
  'Treasure Hunter',   // 18
  'Motherlode',        // 19
  'Lucky Legend',      // 20
  'Golden Touch',      // 21
  'Midas Heir',        // 22
  'Millionaire',       // 23
  'Vault Master',      // 24
  'Mine Tycoon',       // 25
  'Gold Emperor',      // 26
  'Diamond Hands',     // 27
  'Legendary Miner',   // 28
  'El Dorado',         // 29
  'Golden God',        // 30
  'Cosmic Miner',      // 31
  'Galaxy Baron',      // 32
  'Universe Tycoon',   // 33
  'Infinity Miner',    // 34
  'The One',           // 35
];

function calculateLevel(totalGoldEarned: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalGoldEarned >= LEVEL_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
}

function getXPProgress(totalGoldEarned: number, currentLevel: number): { current: number; needed: number; percent: number } {
  const currentThreshold = LEVEL_THRESHOLDS[currentLevel - 1] || 0;
  const nextThreshold = LEVEL_THRESHOLDS[currentLevel] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] * 2;
  const current = totalGoldEarned - currentThreshold;
  const needed = nextThreshold - currentThreshold;
  const percent = Math.min((current / needed) * 100, 100);
  return { current, needed, percent };
}

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
  hasGoat: boolean;
  hasLucky: boolean;
  hasDiamondMine: boolean;
  hasInferno: boolean;
  maxCombo: number;
  activeBoost: ActiveBoost | null;
  instantGoldPending: number;
  botCount: number;
  globalMultiplier: number;
  luckyChance: number;
  luckyMultiplier: number;
  autoClickRate: number;
  mineCount: number;
}

function calculateVerifiedBonuses(purchases: OnChainPurchase[], currentTime: number): VerifiedBonuses {
  let bonusClick = 0;
  let bonusPassive = 0;
  let hasCrown = false;
  let hasGoat = false;
  let hasLucky = false;
  let hasDiamondMine = false;
  let hasInferno = false;
  let maxCombo = 10;
  let activeBoost: ActiveBoost | null = null;
  let instantGoldPending = 0;
  let botCount = 0;
  let globalMultiplier = 1;
  let luckyChance = 0;
  let luckyMultiplier = 1;
  let autoClickRate = 0;
  let mineCount = 1;

  purchases.forEach(purchase => {
    const item = matchEthToItem(purchase.ethAmount);
    if (!item) return;

    switch (item.effect.type) {
      case 'permanent_click':
        bonusClick += item.effect.amount || 10;
        break;
      case 'permanent_passive':
        bonusPassive += item.effect.amount || 100;
        // Check if it's Diamond Mine (500 passive) or regular Auto-Miner (100 passive)
        if (item.effect.amount === 500) {
          hasDiamondMine = true;
        } else {
          botCount++;
        }
        break;
      case 'cosmetic':
        hasCrown = true;
        maxCombo = Math.max(maxCombo, item.effect.maxCombo || 15);
        break;
      case 'boost':
        const boostEndTime = purchase.timestamp + (item.effect.duration || 600000);
        const remaining = boostEndTime - currentTime;
        if (remaining > 0) {
          // Keep the HIGHEST multiplier boost that's still active
          if (!activeBoost || item.effect.multiplier > activeBoost.multiplier) {
            activeBoost = { 
              multiplier: item.effect.multiplier || 2, 
              endTime: boostEndTime,
              remaining 
            };
          }
        }
        break;
      case 'instant_gold':
        instantGoldPending++;
        break;
      case 'burn_bonus':
        bonusClick += item.effect.clickAmount || 5;
        bonusPassive += item.effect.passiveAmount || 25;
        // Check if it's Inferno Burn (25 click, 100 passive) or regular Burn Booster
        if ((item.effect.clickAmount || 0) >= 25) {
          hasInferno = true;
        }
        break;
      // ============ SEASON 2 EFFECTS ============
      case 'global_multiplier':
        globalMultiplier *= item.effect.multiplier || 2;
        mineCount++;
        break;
      case 'golden_goat':
        hasGoat = true;
        maxCombo = Math.max(maxCombo, item.effect.maxCombo || 25);
        autoClickRate += item.effect.autoClick || 2;
        break;
      case 'lucky':
        hasLucky = true;
        luckyChance = Math.min(luckyChance + (item.effect.chance || 0.15), 0.5); // Cap at 50%
        luckyMultiplier = Math.max(luckyMultiplier, item.effect.multiplier || 10);
        break;
    }
  });

  return { 
    bonusClick, bonusPassive, hasCrown, hasGoat, hasLucky, hasDiamondMine, hasInferno,
    maxCombo, activeBoost, instantGoldPending, botCount, globalMultiplier, luckyChance, 
    luckyMultiplier, autoClickRate, mineCount 
  };
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
function MineVisualization({ 
  upgrades, 
  botCount = 0, 
  mineCount = 1, 
  hasGoat = false,
  hasLucky = false,
  hasDiamondMine = false,
  hasInferno = false,
  boostMultiplier = 1
}: { 
  upgrades: typeof INITIAL_UPGRADES; 
  botCount?: number; 
  mineCount?: number; 
  hasGoat?: boolean;
  hasLucky?: boolean;
  hasDiamondMine?: boolean;
  hasInferno?: boolean;
  boostMultiplier?: number;
}) {
  const totalUpgrades = Object.values(upgrades).reduce((sum, u) => sum + u.owned, 0) + botCount;
  
  if (totalUpgrades === 0 && mineCount <= 1 && !hasGoat && !hasLucky && !hasDiamondMine && !hasInferno) {
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
  
  // Determine mine theme based on Season 2 items
  const hasS2Items = mineCount > 1 || hasGoat || hasDiamondMine || hasInferno;
  
  return (
    <div className={`mt-4 p-3 rounded-xl overflow-hidden ${
      hasS2Items 
        ? 'bg-gradient-to-b from-[#1a0a20] to-[#0a0510] border border-purple-500/30' 
        : 'bg-gradient-to-b from-[#2a1a0a] to-[#1a0f05] border border-[#3d2817]'
    }`}>
      <div className="text-center text-sm text-[#D4AF37] mb-2 flex items-center justify-center gap-2 flex-wrap">
        {mineCount > 1 && <span className="text-purple-400 text-xs bg-purple-500/20 px-2 py-0.5 rounded-full animate-pulse">{mineCount}x MINES</span>}
        {boostMultiplier > 1 && <span className="text-yellow-400 text-xs bg-yellow-500/20 px-2 py-0.5 rounded-full animate-pulse">⚡{boostMultiplier}x</span>}
        <span>⛏️ {levelName} Mine (Lvl {level})</span>
        {hasGoat && <span className="text-yellow-400">🐐</span>}
        {hasLucky && <span className="text-emerald-400">🍀</span>}
        {hasDiamondMine && <span className="text-cyan-400">💎</span>}
        {hasInferno && <span className="text-orange-400">🔥</span>}
      </div>
      <div className={`relative h-40 rounded-lg overflow-hidden ${mineCount > 1 ? 'border-2 border-purple-500/30' : ''}`} style={{
        background: hasS2Items 
          ? 'linear-gradient(to bottom, #1a0a20, #0f0518, #080210)'
          : 'linear-gradient(to bottom, #2a1a0a, #1a0f05, #0f0a03)'
      }}>
        {/* Background grid */}
        <div className="absolute inset-0 opacity-20" style={{
          background: `
            repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(60, 40, 20, 0.3) 20px, rgba(60, 40, 20, 0.3) 21px),
            repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(60, 40, 20, 0.2) 20px, rgba(60, 40, 20, 0.2) 21px)
          `
        }} />
        
        {/* SEASON 2: Multiple Mine Shafts */}
        {mineCount > 1 && (
          <div className="absolute inset-0 flex justify-around items-end pb-2 opacity-60">
            {Array.from({ length: Math.min(mineCount, 4) }).map((_, i) => (
              <div key={`shaft-${i}`} className="flex flex-col items-center">
                <div className="w-8 h-16 bg-gradient-to-b from-purple-900/50 to-black rounded-t-lg border-2 border-purple-500/30" 
                  style={{ animation: 'goldmineShine 2s ease-in-out infinite', animationDelay: `${i * 0.5}s` }}>
                  <div className="w-full h-2 bg-purple-500/40 mt-1"></div>
                  <div className="w-full h-2 bg-purple-500/30 mt-2"></div>
                </div>
                <span className="text-lg mt-1" style={{ filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.8))' }}>🏔️</span>
              </div>
            ))}
          </div>
        )}
        
        {/* SEASON 2: Diamond Mine sparkles */}
        {hasDiamondMine && (
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={`diamond-${i}`}
                className="absolute text-lg"
                style={{
                  left: `${5 + Math.random() * 90}%`,
                  top: `${5 + Math.random() * 90}%`,
                  animation: `veinGlow 1.5s ease-in-out infinite`,
                  animationDelay: `${Math.random() * 2}s`,
                  filter: 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.8))'
                }}
              >💎</div>
            ))}
          </div>
        )}
        
        {/* SEASON 2: Lucky Clovers scattered */}
        {hasLucky && (
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`clover-${i}`}
                className="absolute text-sm"
                style={{
                  left: `${10 + Math.random() * 80}%`,
                  top: `${10 + Math.random() * 80}%`,
                  animation: `veinGlow 2s ease-in-out infinite`,
                  animationDelay: `${Math.random() * 2}s`,
                  filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.8))'
                }}
              >🍀</div>
            ))}
          </div>
        )}
        
        {/* SEASON 2: Inferno flames */}
        {hasInferno && (
          <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={`flame-${i}`}
                className="absolute text-xl"
                style={{
                  left: `${i * 10 + Math.random() * 5}%`,
                  bottom: `${Math.random() * 20}px`,
                  animation: `dynamiteExplode 1s ease-in-out infinite`,
                  animationDelay: `${Math.random()}s`,
                  filter: 'drop-shadow(0 0 10px rgba(249, 115, 22, 0.8))'
                }}
              >🔥</div>
            ))}
          </div>
        )}
        
        {/* SEASON 2: Golden Goat mascot */}
        {hasGoat && (
          <div className="absolute bottom-4 left-0 right-0">
            <span 
              className="absolute text-2xl"
              style={{ 
                animation: `minerWalk 8s linear infinite`,
                filter: 'drop-shadow(0 0 12px rgba(251, 191, 36, 0.9))'
              }}
            >🐐</span>
          </div>
        )}
        
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
                background: hasDiamondMine 
                  ? 'radial-gradient(circle, #06B6D4 0%, #0891B2 70%, transparent 100%)'
                  : 'radial-gradient(circle, #D4AF37 0%, #996515 70%, transparent 100%)',
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
        
        {/* Gold mines (from upgrades, not Second Mine) */}
        {!hasDiamondMine && (
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {Array.from({ length: Math.min(upgrades.goldmine.owned, 3) }).map((_, i) => (
              <span key={`mine-${i}`} className="text-xl" style={{ animation: 'goldmineShine 3s ease-in-out infinite', animationDelay: `${i * 0.5}s` }}>🏔️</span>
            ))}
          </div>
        )}
        
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
              className="absolute w-1 h-1 rounded-full"
              style={{
                left: `${10 + Math.random() * 80}%`,
                bottom: '20px',
                background: hasDiamondMine ? '#06B6D4' : '#D4AF37',
                animation: `floatParticle 4s ease-in-out infinite`,
                animationDelay: `${Math.random() * 4}s`,
              }}
            />
          ))}
        </div>
        
        {/* SEASON 2: Boost lightning effect overlay */}
        {boostMultiplier >= 5 && (
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(circle at center, rgba(250, 204, 21, 0.1) 0%, transparent 70%)',
            animation: 'veinGlow 0.5s ease-in-out infinite'
          }}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl" style={{
              animation: 'dynamiteExplode 0.5s ease-in-out infinite',
              filter: 'drop-shadow(0 0 20px rgba(250, 204, 21, 0.9))'
            }}>⚡</div>
          </div>
        )}
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
  const appKit = useAppKit();
  const { data: ethBalance } = useBalance({ address });
  const { data: bgBalance } = useBalance({ address, token: BG_TOKEN });
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();

  // Transaction hook for shop purchases (cleaner than OnchainKit)
  const { 
    sendTransaction, 
    data: txHash, 
    isPending: isTxPending, 
    isError: isTxError,
    error: txErrorData,
    reset: resetTx 
  } = useSendTransaction();
  
  const { 
    isLoading: isConfirming, 
    isSuccess: isConfirmed,
    data: txReceipt
  } = useWaitForTransactionReceipt({ hash: txHash });

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
  
  // ============ LEVEL SYSTEM STATE ============
  const [totalGoldEarned, setTotalGoldEarned] = useState(0);
  const [playerLevel, setPlayerLevel] = useState(1);
  const [unlockedUpgrades, setUnlockedUpgrades] = useState<Set<string>>(new Set(['pickaxe']));
  const [notifications, setNotifications] = useState<Array<{id: number, type: 'level' | 'unlock', message: string, emoji: string, subtext?: string}>>([]);
  const prevLevelRef = useRef(1);
  
  // ============ ANTI-CHEAT STATE ============
  const antiCheatRef = useRef<AntiCheatState>({
    clickIntervals: [],
    clickPositions: [],
    mouseMovements: 0,
    suspicionFlags: 0,
    isTabFocused: true,
    lastAnalysis: Date.now(),
    isSuspicious: false,
    penaltyMultiplier: 1,
    honeypotTriggered: false,
    clicksSinceChallenge: 0,
    lastChallengeTime: Date.now(),
    challengesPassed: 0,
    challengesFailed: 0,
  });
  const [antiCheatWarning, setAntiCheatWarning] = useState<string | null>(null);
  const [showChallenge, setShowChallenge] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState<{x: number, y: number} | null>(null);
  const [challengeTimeout, setChallengeTimeout] = useState<NodeJS.Timeout | null>(null);
  const showChallengeRef = useRef(false); // Ref to avoid stale closure in timeout
  showChallengeRef.current = showChallenge;
  
  // Cleanup challenge timeout on unmount
  useEffect(() => {
    return () => {
      if (challengeTimeout) clearTimeout(challengeTimeout);
    };
  }, [challengeTimeout]);
  
  // Track tab focus for anti-cheat
  useEffect(() => {
    const handleFocus = () => { antiCheatRef.current.isTabFocused = true; };
    const handleBlur = () => { antiCheatRef.current.isTabFocused = false; };
    
    // Track mouse movement (bots don't move the mouse!)
    const handleMouseMove = () => {
      antiCheatRef.current.mouseMovements++;
    };
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
  
  // Reset anti-cheat penalty when player stops clicking for 2+ seconds (combo resets)
  useEffect(() => {
    const checkComboReset = setInterval(() => {
      const now = Date.now();
      const ac = antiCheatRef.current;
      
      // If more than 2 seconds since last click and player had a penalty
      if (lastClickTime > 0 && now - lastClickTime > 2000 && ac.penaltyMultiplier < 1) {
        // Reset anti-cheat state - give them a fresh start
        ac.suspicionFlags = 0;
        ac.isSuspicious = false;
        ac.penaltyMultiplier = 1;
        ac.clickIntervals = [];
        ac.clickPositions = [];
        ac.mouseMovements = 0;
        setAntiCheatWarning(null);
        
        // Also reset combo visually
        if (combo > 1) {
          setCombo(1);
        }
        
        console.log('🔄 Anti-cheat reset: Player took a break');
      }
    }, 500); // Check every 500ms
    
    return () => clearInterval(checkComboReset);
  }, [lastClickTime, combo]);
  
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
          
          // Merge saved upgrades with new defaults (in case new upgrades were added)
          if (data.gameState.upgrades) {
            setUpgrades(prev => {
              const merged = { ...INITIAL_UPGRADES };
              // Copy over saved upgrade data, preserving new upgrade defaults
              Object.keys(data.gameState.upgrades).forEach(key => {
                if (merged[key as keyof typeof merged]) {
                  merged[key as keyof typeof merged] = {
                    ...merged[key as keyof typeof merged],
                    ...data.gameState.upgrades[key],
                  };
                }
              });
              return merged;
            });
          }
          
          if (Array.isArray(data.gameState.appliedInstantGold)) {
            setAppliedInstantGold(new Set(data.gameState.appliedInstantGold));
          }
          // Level system state
          if (typeof data.gameState.totalGoldEarned === 'number') setTotalGoldEarned(data.gameState.totalGoldEarned);
          if (typeof data.gameState.playerLevel === 'number') {
            setPlayerLevel(data.gameState.playerLevel);
            prevLevelRef.current = data.gameState.playerLevel;
          }
          if (Array.isArray(data.gameState.unlockedUpgrades)) {
            setUnlockedUpgrades(new Set(data.gameState.unlockedUpgrades));
          }
          
          // Apply offline earnings (calculated server-side)
          if (data.offlineGold && data.offlineGold > 0) {
            setGold(prev => prev + data.offlineGold);
            setTotalGoldEarned(prev => prev + data.offlineGold);
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
      // Reset level system state
      setTotalGoldEarned(0);
      setPlayerLevel(1);
      prevLevelRef.current = 1;
      setUnlockedUpgrades(new Set(['pickaxe']));
      setNotifications([]);
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
        // Level system state
        totalGoldEarned,
        playerLevel,
        unlockedUpgrades: Array.from(unlockedUpgrades),
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
  }, [address, sessionId, isKicked, gold, totalClicks, upgrades, appliedInstantGold, lastClickTime, totalGoldEarned, playerLevel, unlockedUpgrades]);
  
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
  
  // Calculate upgrade-based luck and boost bonuses
  const upgradeLuckChance = useMemo(() => {
    const luckyUpgrade = upgrades.luckyStrike as any;
    // 5% chance per level, capped at 40%
    return Math.min(luckyUpgrade.owned * 0.05, 0.40);
  }, [upgrades]);
  
  const upgradeLuckMultiplier = useMemo(() => {
    const luckyUpgrade = upgrades.luckyStrike as any;
    // 3x base + 0.5x per additional level
    return luckyUpgrade.owned > 0 ? 3 + (luckyUpgrade.owned - 1) * 0.5 : 1;
  }, [upgrades]);
  
  const upgradeBoostMultiplier = useMemo(() => {
    const boostUpgrade = upgrades.goldBoost as any;
    // 10% boost per level (multiplicative: 1.1^n)
    return Math.pow(1.1, boostUpgrade.owned);
  }, [upgrades]);
  
  // Final values from on-chain data
  const goldPerClick = baseGoldPerClick + verifiedBonuses.bonusClick;
  const goldPerSecond = baseGoldPerSecond + verifiedBonuses.bonusPassive;
  const clickMultiplier = verifiedBonuses.activeBoost?.multiplier || 1;
  const boostEndTime = verifiedBonuses.activeBoost?.endTime || null;
  const boostRemaining = verifiedBonuses.activeBoost?.remaining || 0;
  const hasCrown = verifiedBonuses.hasCrown;
  const hasGoat = verifiedBonuses.hasGoat;
  const maxCombo = verifiedBonuses.maxCombo;
  const globalMultiplier = verifiedBonuses.globalMultiplier;
  const luckyChance = verifiedBonuses.luckyChance;
  const luckyMultiplier = verifiedBonuses.luckyMultiplier;
  const autoClickRate = verifiedBonuses.autoClickRate;
  const mineCount = verifiedBonuses.mineCount;

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

  // Passive income (with global multiplier from Second Mine and upgrade boost)
  useEffect(() => {
    const interval = setInterval(() => {
      if (goldPerSecond > 0) {
        const passiveEarnings = Math.floor(goldPerSecond * globalMultiplier * upgradeBoostMultiplier);
        setGold(prev => prev + passiveEarnings);
        setTotalGoldEarned(prev => prev + passiveEarnings);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [goldPerSecond, globalMultiplier, upgradeBoostMultiplier]);

  // Auto-click from Golden Goat (Season 2)
  useEffect(() => {
    if (autoClickRate <= 0) return;
    
    const interval = setInterval(() => {
      // Auto-clicks happen at autoClickRate times per second
      const autoEarned = Math.floor(goldPerClick * globalMultiplier * upgradeBoostMultiplier);
      setGold(prev => prev + autoEarned);
      setTotalGoldEarned(prev => prev + autoEarned);
      setTotalClicks(prev => prev + 1);
    }, 1000 / autoClickRate);
    
    return () => clearInterval(interval);
  }, [autoClickRate, goldPerClick, globalMultiplier, upgradeBoostMultiplier]);

  // ============ LEVEL SYSTEM ============
  
  // Check for level ups and new unlocks
  useEffect(() => {
    const newLevel = calculateLevel(totalGoldEarned);
    
    // Level up detected
    if (newLevel > prevLevelRef.current) {
      setPlayerLevel(newLevel);
      
      // Show level up notification
      const title = LEVEL_TITLES[newLevel - 1] || 'Master Miner';
      const notifId = Date.now();
      setNotifications(prev => [...prev, {
        id: notifId,
        type: 'level',
        message: `Level ${newLevel}!`,
        emoji: '🎉',
        subtext: title
      }]);
      
      // Play achievement sound
      playSound('achievement', newLevel, true);
      
      // Check for newly unlocked upgrades
      Object.entries(INITIAL_UPGRADES).forEach(([key, upgrade]) => {
        if (upgrade.unlockLevel === newLevel && !unlockedUpgrades.has(key)) {
          setUnlockedUpgrades(prev => new Set([...prev, key]));
          
          // Show unlock notification (slightly delayed)
          setTimeout(() => {
            const unlockId = Date.now();
            setNotifications(prev => [...prev, {
              id: unlockId,
              type: 'unlock',
              message: `${upgrade.name} Unlocked!`,
              emoji: upgrade.emoji,
              subtext: `New upgrade available`
            }]);
            playSound('upgrade', 1, true);
          }, 1500);
        }
      });
      
      prevLevelRef.current = newLevel;
      
      // Auto-remove notification after 4 seconds
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notifId));
      }, 4000);
    }
    
    // Also check for unlocks on initial load (in case upgrades were unlocked before but not tracked)
    Object.entries(INITIAL_UPGRADES).forEach(([key, upgrade]) => {
      if (upgrade.unlockLevel <= newLevel && !unlockedUpgrades.has(key)) {
        setUnlockedUpgrades(prev => new Set([...prev, key]));
      }
    });
    
  }, [totalGoldEarned, unlockedUpgrades]);

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
    const ac = antiCheatRef.current;
    
    // Block clicks if challenge is active
    if (showChallenge) return;
    
    // ============ ANTI-CHEAT ANALYSIS ============
    
    // Track click interval
    if (lastClickTime > 0) {
      const interval = now - lastClickTime;
      ac.clickIntervals.push(interval);
      
      // Keep only recent intervals
      if (ac.clickIntervals.length > ANTI_CHEAT.PATTERN_WINDOW) {
        ac.clickIntervals.shift();
      }
      
      // Detect impossibly fast clicks (< 30ms = 33+ CPS, physically impossible)
      if (interval < ANTI_CHEAT.MIN_CLICK_INTERVAL) {
        ac.suspicionFlags += 2;
        console.warn('⚠️ Anti-cheat: Impossibly fast click detected');
      }
    }
    
    // Track click position
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ac.clickPositions.push({ x, y });
    if (ac.clickPositions.length > ANTI_CHEAT.PATTERN_WINDOW) {
      ac.clickPositions.shift();
    }
    
    // Increment click counter for challenges
    ac.clicksSinceChallenge++;
    
    // Analyze patterns every 50 clicks
    if (ac.clickIntervals.length >= ANTI_CHEAT.PATTERN_WINDOW && now - ac.lastAnalysis > 5000) {
      ac.lastAnalysis = now;
      
      const { variance, isBotLike } = analyzeClickPattern(ac.clickIntervals);
      const samePosition = analyzeClickPositions(ac.clickPositions);
      
      // Check for bot-like timing
      if (isBotLike) {
        ac.suspicionFlags += 1;
        console.warn(`⚠️ Anti-cheat: Bot-like timing detected (variance: ${(variance * 100).toFixed(1)}%)`);
      }
      
      // Check for same position clicks
      if (samePosition) {
        ac.suspicionFlags += 1;
        console.warn('⚠️ Anti-cheat: Same click position detected');
      }
      
      // Check for no mouse movement (MAJOR red flag!)
      if (ac.mouseMovements < ANTI_CHEAT.MOUSE_MOVEMENT_REQUIRED) {
        ac.suspicionFlags += 3;
        console.warn('⚠️ Anti-cheat: No mouse movement detected (likely script/bot)');
      }
      
      // Reset mouse movement counter
      ac.mouseMovements = 0;
      
      // Update suspicion status - SOFTENED: Max 10% earnings, no bans
      if (ac.suspicionFlags >= ANTI_CHEAT.MAX_PENALTY_THRESHOLD) {
        ac.isSuspicious = true;
        ac.penaltyMultiplier = ANTI_CHEAT.BOT_PENALTY_MULTIPLIER; // 10% earnings (max penalty)
        setAntiCheatWarning('⚠️ Automated clicking detected. Earnings reduced to 10%.');
      } else if (ac.suspicionFlags >= ANTI_CHEAT.SUSPICION_THRESHOLD) {
        ac.isSuspicious = true;
        // Gradual penalty: scale from 50% to 10% based on flags
        const penaltyScale = (ac.suspicionFlags - ANTI_CHEAT.SUSPICION_THRESHOLD) / 
                            (ANTI_CHEAT.MAX_PENALTY_THRESHOLD - ANTI_CHEAT.SUSPICION_THRESHOLD);
        ac.penaltyMultiplier = 0.5 - (penaltyScale * 0.4); // 50% down to 10%
        setAntiCheatWarning('⚠️ Suspicious activity detected. Play manually for full earnings!');
      }
    }
    
    // Trigger challenge for high-speed sustained clicking
    const currentCPS = clickTimestamps.current.length;
    if (currentCPS >= ANTI_CHEAT.HIGH_SPEED_THRESHOLD && 
        ac.clicksSinceChallenge >= ANTI_CHEAT.CHALLENGE_INTERVAL &&
        now - ac.lastChallengeTime > 30000) { // Max one challenge per 30 seconds
      // Show challenge
      const target = generateChallengePosition();
      setChallengeTarget(target);
      setShowChallenge(true);
      ac.lastChallengeTime = now;
      ac.clicksSinceChallenge = 0;
      
      // Auto-fail if not completed in 5 seconds
      const timeout = setTimeout(() => {
        if (showChallengeRef.current) { // Use ref to avoid stale closure
          ac.challengesFailed++;
          ac.suspicionFlags += 2;
          setShowChallenge(false);
          setChallengeTarget(null);
          setAntiCheatWarning('⚠️ Challenge failed. Suspicion increased.');
        }
      }, 5000);
      setChallengeTimeout(timeout);
      
      return; // Don't process this click
    }
    
    // ============ RATE LIMITING ============
    
    clickTimestamps.current = clickTimestamps.current.filter(t => now - t < 1000);
    if (clickTimestamps.current.length >= MAX_CLICKS_PER_SECOND) return;
    clickTimestamps.current.push(now);
    
    // ============ CALCULATE EARNINGS ============
    
    let newCombo = now - lastClickTime < 2000 ? Math.min(combo + 1, maxCombo) : 1;
    setCombo(newCombo);
    setLastClickTime(now);
    
    // Check for lucky hit (combines on-chain and upgrade-based luck)
    const totalLuckChance = Math.min(luckyChance + upgradeLuckChance, 0.5); // Cap at 50%
    const totalLuckMultiplier = Math.max(luckyMultiplier, upgradeLuckMultiplier); // Use best multiplier
    const isLucky = totalLuckChance > 0 && Math.random() < totalLuckChance;
    const luckyBonus = isLucky ? totalLuckMultiplier : 1;
    
    // Apply upgrade boost multiplier (stacks with on-chain global multiplier)
    const totalBoostMultiplier = globalMultiplier * upgradeBoostMultiplier;
    
    // Apply anti-cheat penalty
    const focusPenalty = ac.isTabFocused ? 1 : ANTI_CHEAT.UNFOCUSED_PENALTY;
    const cheatPenalty = ac.penaltyMultiplier;
    
    // Calculate earnings with all multipliers including anti-cheat penalties
    const baseEarned = Math.floor(goldPerClick * clickMultiplier * newCombo * totalBoostMultiplier * luckyBonus);
    const earned = Math.max(1, Math.floor(baseEarned * focusPenalty * cheatPenalty)); // Minimum 1 gold per click
    
    setGold(prev => prev + earned);
    setTotalGoldEarned(prev => prev + earned);
    setTotalClicks(prev => prev + 1);
    
    // Play sounds (only if not penalized heavily)
    if (cheatPenalty > 0.5) {
      playSound('click', newCombo, soundEnabled);
      if (isLucky) {
        playSound('achievement', newCombo, soundEnabled);
      } else if (newCombo >= 5) {
        playSound('megaCombo', newCombo, soundEnabled);
      } else if (newCombo > 1) {
        playSound('combo', newCombo, soundEnabled);
      }
    }
    
    const id = Date.now();
    const displayText = isLucky ? `🍀 +${formatNumber(earned)}` : `+${formatNumber(earned)}`;
    setFloatingTexts(prev => [...prev, { id, text: displayText, x, y }]);
    setTimeout(() => setFloatingTexts(prev => prev.filter(ft => ft.id !== id)), 1000);
  }, [combo, lastClickTime, goldPerClick, clickMultiplier, maxCombo, soundEnabled, luckyChance, luckyMultiplier, globalMultiplier, showChallenge, upgradeLuckChance, upgradeLuckMultiplier, upgradeBoostMultiplier]);

  // Handle challenge completion
  const handleChallengeClick = useCallback(() => {
    const ac = antiCheatRef.current;
    ac.challengesPassed++;
    
    // Reduce suspicion on successful challenge
    ac.suspicionFlags = Math.max(0, ac.suspicionFlags - 2);
    if (ac.suspicionFlags < ANTI_CHEAT.SUSPICION_THRESHOLD) {
      ac.isSuspicious = false;
      ac.penaltyMultiplier = 1;
      setAntiCheatWarning(null);
    }
    
    // Clear challenge
    if (challengeTimeout) clearTimeout(challengeTimeout);
    setShowChallenge(false);
    setChallengeTarget(null);
    playSound('achievement', 1, soundEnabled);
  }, [challengeTimeout, soundEnabled]);

  // Honeypot handler - bots will click this invisible button
  const handleHoneypotClick = useCallback(() => {
    const ac = antiCheatRef.current;
    if (!ac.honeypotTriggered) {
      ac.honeypotTriggered = true;
      ac.suspicionFlags += 10; // Major flag - triggers max penalty
      ac.penaltyMultiplier = ANTI_CHEAT.BOT_PENALTY_MULTIPLIER; // 10% earnings (not ban)
      ac.isSuspicious = true;
      setAntiCheatWarning('⚠️ Bot detected. Earnings reduced to 10%.');
      console.warn('🍯 Anti-cheat: Honeypot triggered!');
    }
  }, []);

  const buyUpgrade = (key: keyof typeof upgrades) => {
    const upgrade = upgrades[key];
    if (gold >= upgrade.cost) {
      playSound('upgrade', 1, soundEnabled);
      // Use functional update with safety check to prevent negative gold
      setGold(prev => Math.max(0, prev - upgrade.cost));
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

  // Handle transaction confirmation - auto start verification
  const selectedItemRef = useRef(selectedItem);
  selectedItemRef.current = selectedItem;
  const txProcessedRef = useRef<string | null>(null); // Guard against double-firing
  
  useEffect(() => {
    if (isConfirmed && selectedItemRef.current && txReceipt) {
      // Guard: Don't process same transaction twice
      const txHash = txReceipt.transactionHash;
      if (txProcessedRef.current === txHash) return;
      txProcessedRef.current = txHash;
      
      console.log('✅ Transaction confirmed:', txHash);
      const item = selectedItemRef.current;
      // Start verification process
      startVerification(item);
      // Reset transaction state
      resetTx();
      // Close checkout panel
      setSelectedItem(null);
      // Play success sound
      playSound('purchase', 1, soundEnabled);
      // Switch to game tab to show verification
      setActiveTab('game');
    }
  }, [isConfirmed, txReceipt, startVerification, resetTx, soundEnabled]);

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
          
          {/* Reown AppKit Wallet Connection - includes Swaps & Onramp! */}
          {isConnected ? (
            <button
              onClick={() => appKit.open({ view: 'Account' })}
              className="flex items-center gap-2 px-3 py-2 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg hover:bg-[#D4AF37]/20 transition-all"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#996515] flex items-center justify-center text-[10px] font-bold text-black">
                {address?.slice(2, 4).toUpperCase()}
              </div>
              <span className="text-xs text-[#D4AF37] font-medium">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            </button>
          ) : (
            <button
              onClick={() => appKit.open()}
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
            <BuyEthButton 
              address={address}
              className="h-9 px-4 bg-[#0052FF] text-white font-semibold text-xs rounded-lg hover:bg-[#0040CC] transition-all flex items-center gap-1.5"
            />
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
        {/* ============ NOTIFICATION POPUPS ============ */}
        {notifications.map((notif, index) => (
          <div
            key={notif.id}
            className={`fixed left-1/2 z-50 ${notif.type === 'level' ? 'bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500' : 'bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500'} text-white px-6 py-4 rounded-2xl shadow-2xl border-2 border-white/40`}
            style={{ 
              top: `${80 + index * 100}px`,
              animation: 'notifSlideIn 0.5s ease-out forwards, notifPulse 1s ease-in-out infinite'
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-4xl drop-shadow-lg">{notif.emoji}</span>
              <div>
                <div className="font-bold text-xl drop-shadow-md">{notif.message}</div>
                {notif.subtext && <div className="text-sm opacity-90 drop-shadow-sm">{notif.subtext}</div>}
              </div>
            </div>
          </div>
        ))}

        {/* ============ GAME TAB ============ */}
        {activeTab === 'game' && (
          <>
            {/* Level & XP Bar */}
            <div className="mb-3 p-3 bg-gradient-to-r from-purple-900/30 to-indigo-900/30 rounded-xl border border-purple-500/30">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">⭐</span>
                  <div>
                    <div className="text-sm font-bold text-purple-300">Level {playerLevel}</div>
                    <div className="text-xs text-purple-400">{LEVEL_TITLES[playerLevel - 1] || 'Master Miner'}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Total Earned</div>
                  <div className="text-sm font-mono text-[#D4AF37]">{formatNumber(totalGoldEarned)}</div>
                </div>
              </div>
              {/* XP Progress Bar */}
              {(() => {
                const xp = getXPProgress(totalGoldEarned, playerLevel);
                return (
                  <div className="relative">
                    <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                        style={{ width: `${xp.percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                      <span>{formatNumber(xp.current)}</span>
                      <span>{formatNumber(xp.needed)} to next level</span>
                    </div>
                  </div>
                );
              })()}
            </div>

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
            {(verifiedBonuses.bonusClick > 0 || verifiedBonuses.bonusPassive > 0 || hasCrown || hasGoat || boostEndTime || globalMultiplier > 1 || luckyChance > 0 || autoClickRate > 0) && (
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
                  {/* Season 2: Global Multiplier (Second Mine) */}
                  {globalMultiplier > 1 && (
                    <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg p-2.5 text-center border border-purple-500/30">
                      <div className="text-purple-400 font-bold text-base">🏔️ {globalMultiplier}x</div>
                      <div className="text-purple-300/80 text-[10px] uppercase tracking-wider">{mineCount} Mines Active</div>
                    </div>
                  )}
                  {/* Season 2: Lucky Nugget */}
                  {luckyChance > 0 && (
                    <div className="bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-lg p-2.5 text-center border border-emerald-500/30">
                      <div className="text-emerald-400 font-bold text-base">🍀 {Math.round(luckyChance * 100)}%</div>
                      <div className="text-emerald-300/80 text-[10px] uppercase tracking-wider">{luckyMultiplier}x Lucky Hits</div>
                    </div>
                  )}
                  {/* Season 2: Golden Goat Auto-Click */}
                  {autoClickRate > 0 && (
                    <div className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 rounded-lg p-2.5 text-center border border-yellow-500/30">
                      <div className="text-yellow-400 font-bold text-base">🐐 {autoClickRate}/sec</div>
                      <div className="text-yellow-300/80 text-[10px] uppercase tracking-wider">Auto-Click</div>
                    </div>
                  )}
                  {/* Crown/Goat Cosmetics */}
                  {(hasCrown || hasGoat) && (
                    <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 rounded-lg p-2.5 text-center border border-amber-500/30">
                      <div className="text-amber-400 font-bold text-base">{hasGoat ? '🐐' : '👑'} {maxCombo}x</div>
                      <div className="text-amber-300/80 text-[10px] uppercase tracking-wider">Max Combo</div>
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

            {/* Strategic Upgrade Bonuses */}
            {(upgradeLuckChance > 0 || upgradeBoostMultiplier > 1) && (
              <div className="mb-4 p-3 bg-gradient-to-b from-purple-500/10 to-purple-500/5 border border-purple-500/30 rounded-xl">
                <div className="text-xs text-purple-400 font-semibold mb-2 text-center flex items-center justify-center gap-2">
                  <span className="text-base">⚡</span>
                  <span>Strategic Upgrades Active</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {upgradeLuckChance > 0 && (
                    <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg p-2.5 text-center border border-green-500/30">
                      <div className="text-emerald-400 font-bold text-base">🍀 {Math.round(upgradeLuckChance * 100)}%</div>
                      <div className="text-emerald-300/80 text-[10px] uppercase tracking-wider">{upgradeLuckMultiplier.toFixed(1)}x Crits</div>
                    </div>
                  )}
                  {upgradeBoostMultiplier > 1 && (
                    <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 rounded-lg p-2.5 text-center border border-amber-500/30">
                      <div className="text-yellow-400 font-bold text-base">✨ +{Math.round((upgradeBoostMultiplier - 1) * 100)}%</div>
                      <div className="text-yellow-300/80 text-[10px] uppercase tracking-wider">All Gold</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Anti-Cheat Warning - Friendly yellow instead of harsh red */}
            {antiCheatWarning && (
              <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-xl text-center">
                <div className="text-yellow-400 text-sm font-medium">{antiCheatWarning}</div>
                <div className="text-yellow-300/60 text-xs mt-1">💡 Tip: Manual clicking = full rewards!</div>
              </div>
            )}

            {/* Gold Coin */}
            <div className="relative flex justify-center items-center h-56 mb-4">
              {floatingTexts.map(ft => (
                <div key={ft.id} className={`absolute pointer-events-none font-bold text-xl ${ft.text.includes('🍀') ? 'text-emerald-400' : 'text-[#D4AF37]'}`} style={{ left: ft.x, top: ft.y, animation: 'floatUp 1s ease-out forwards' }}>
                  {ft.text}
                </div>
              ))}
              
              {/* Crown/Goat indicator */}
              {(hasCrown || hasGoat) && !showChallenge && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 text-4xl animate-bounce">
                  {hasGoat ? '🐐' : '👑'}
                </div>
              )}
              
              {/* Challenge Overlay */}
              {showChallenge && challengeTarget && (
                <div className="absolute inset-0 bg-black/80 rounded-xl z-20 flex flex-col items-center justify-center">
                  <div className="text-yellow-400 text-lg font-bold mb-2 animate-pulse">⚡ HUMAN CHECK ⚡</div>
                  <div className="text-gray-300 text-sm mb-4">Click the gold nugget!</div>
                  <div className="relative w-40 h-40">
                    <button
                      onClick={handleChallengeClick}
                      className="absolute w-12 h-12 rounded-full bg-gradient-to-br from-[#FFD700] to-[#FFA500] border-2 border-[#FF8C00] shadow-lg hover:scale-110 transition-transform flex items-center justify-center text-2xl animate-pulse"
                      style={{
                        left: `calc(50% + ${challengeTarget.x}px - 24px)`,
                        top: `calc(50% + ${challengeTarget.y}px - 24px)`,
                      }}
                    >
                      🪙
                    </button>
                  </div>
                  <div className="text-gray-500 text-xs mt-2">5 seconds remaining...</div>
                </div>
              )}
              
              {/* Main BG Coin Button */}
              <button onClick={handleClick} className={`w-44 h-44 rounded-full select-none border-8 shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_50px_rgba(212,175,55,0.3)] hover:shadow-[0_0_80px_rgba(212,175,55,0.5)] active:scale-95 transition-all duration-100 flex items-center justify-center text-4xl font-bold ${
                showChallenge ? 'opacity-30 pointer-events-none' :
                hasGoat 
                  ? 'bg-gradient-to-br from-[#FFE4B5] via-[#FFD700] to-[#FFA500] border-[#FF8C00] text-[#8B4513]' 
                  : hasCrown 
                    ? 'bg-gradient-to-br from-[#FFF8DC] via-[#FFD700] to-[#DAA520] border-[#B8860B] text-[#8B4513]' 
                    : 'bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] border-[#996515] text-[#996515]'
              }`}>
                BG
              </button>
              
              {/* HONEYPOT TRAP - Invisible button that bots will click */}
              {/* This button has textContent "BG" and large size, so naive bots will find it */}
              <button 
                onClick={handleHoneypotClick}
                aria-hidden="true"
                tabIndex={-1}
                className="absolute opacity-0 pointer-events-auto"
                style={{
                  width: '180px',
                  height: '180px',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: -1,
                  // Make it look like the real button to querySelector
                }}
              >
                BG
              </button>
              
              {/* Lucky indicator */}
              {luckyChance > 0 && (
                <div className="absolute bottom-0 right-1/4 text-2xl">🍀</div>
              )}
            </div>

            {/* Upgrades */}
            <h3 className="text-[#D4AF37] mb-2 text-sm font-semibold flex items-center gap-2">
              <span>⚡</span>
              <span>Upgrades</span>
              <span className="text-[10px] text-gray-500 ml-auto">Lv.{playerLevel}</span>
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(upgrades).map(([key, upgrade]) => {
                const isLucky = key === 'luckyStrike';
                const isBoost = key === 'goldBoost';
                const isLocked = !unlockedUpgrades.has(key);
                const unlockLevel = (INITIAL_UPGRADES as any)[key]?.unlockLevel || 1;
                const bonusText = isLucky 
                  ? `${Math.min(upgrade.owned * 5, 40)}% crit` 
                  : isBoost 
                  ? `+${Math.round((Math.pow(1.1, upgrade.owned) - 1) * 100)}%` 
                  : upgrade.perClick > 0 
                  ? `+${upgrade.perClick}/click` 
                  : `+${upgrade.perSec}/sec`;
                
                // Locked upgrade display
                if (isLocked) {
                  return (
                    <div
                      key={key}
                      className="p-2.5 rounded-xl border border-gray-700/50 bg-gray-900/50 text-left text-sm relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                        <div className="text-center">
                          <div className="text-2xl mb-1">🔒</div>
                          <div className="text-xs text-gray-400">Level {unlockLevel}</div>
                        </div>
                      </div>
                      <div className="opacity-30">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-base">{upgrade.emoji}</span>
                          <span className="text-xs font-semibold text-white">{upgrade.name}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500 text-xs font-mono">???</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <button
                    key={key}
                    onClick={() => buyUpgrade(key as keyof typeof upgrades)}
                    disabled={gold < upgrade.cost}
                    className={`p-2.5 rounded-xl border transition-all text-left text-sm ${gold >= upgrade.cost ? 'bg-gradient-to-br from-[#D4AF37]/15 to-[#D4AF37]/5 border-[#D4AF37]/40 hover:border-[#D4AF37]/60 hover:shadow-lg hover:shadow-[#D4AF37]/10' : 'bg-white/5 border-white/10 opacity-50'} ${(isLucky || isBoost) ? 'border-purple-500/40' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-base">{upgrade.emoji}</span>
                      <span className="text-xs font-semibold text-white">{upgrade.name}</span>
                      {(isLucky || isBoost) && <span className="text-[8px] text-purple-400 bg-purple-500/20 px-1 rounded">STRAT</span>}
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[#D4AF37] text-xs font-mono">{formatNumber(upgrade.cost)}</span>
                        <span className={`text-[9px] ${(isLucky || isBoost) ? 'text-purple-300' : 'text-gray-500'}`}>{bonusText}</span>
                      </div>
                      <span className="text-gray-400 text-[10px] bg-white/10 px-1.5 py-0.5 rounded">x{upgrade.owned}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Mine Visualization */}
            <MineVisualization 
              upgrades={upgrades} 
              botCount={verifiedBonuses.botCount} 
              mineCount={mineCount} 
              hasGoat={hasGoat} 
              hasLucky={verifiedBonuses.hasLucky}
              hasDiamondMine={verifiedBonuses.hasDiamondMine}
              hasInferno={verifiedBonuses.hasInferno}
              boostMultiplier={clickMultiplier}
            />
            
            {/* Ad Banner */}
            <AdBanner />
          </>
        )}

        {/* ============ SHOP TAB ============ */}
        {activeTab === 'shop' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">💎 Premium Shop</h2>
              <p className="text-xs text-gray-400">Pay with ETH → Contract burns BG 🔥</p>
            </div>

            {/* ETH Balance Warning */}
            {isConnected && ethBalance && parseFloat(ethBalance.formatted) < 0.0005 && (
              <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-red-400">⚠️</span>
                  <span className="text-red-400 font-medium">You need ETH to buy items</span>
                </div>
                <div className="text-xs text-gray-400 mb-3">Shop purchases are paid in ETH (which buys & burns BG automatically)</div>
                <div className="flex gap-2">
                  <BuyEthButton 
                    address={address}
                    className="flex-1 py-2 bg-[#0052FF] text-white font-semibold text-sm rounded-lg text-center hover:bg-[#0040CC] transition-all flex items-center justify-center gap-1.5"
                  />
                  <a 
                    href="https://relay.link/bridge/base" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="py-2 px-4 bg-white/10 border border-white/20 text-gray-300 font-semibold text-sm rounded-lg hover:bg-white/20 transition-all flex items-center gap-1.5"
                  >
                    <span>🌉</span>
                    <span>Bridge</span>
                  </a>
                </div>
              </div>
            )}

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
                    {verificationSuccess.effect.type === 'global_multiplier' && `🏔️ ${verificationSuccess.effect.multiplier}x GLOBAL multiplier on ALL earnings!`}
                    {verificationSuccess.effect.type === 'golden_goat' && `🐐 ${verificationSuccess.effect.maxCombo}x max combo + ${verificationSuccess.effect.autoClick}/sec auto-clicks!`}
                    {verificationSuccess.effect.type === 'lucky' && `🍀 ${Math.round((verificationSuccess.effect.chance || 0) * 100)}% chance for ${verificationSuccess.effect.multiplier}x gold per click!`}
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
              {/* Season 2 Banner */}
              <div className="mb-4 p-3 bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-orange-500/20 border border-purple-500/30 rounded-xl">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl">🆕</span>
                  <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400">SEASON 2 ITEMS NOW AVAILABLE!</span>
                  <span className="text-2xl">🆕</span>
                </div>
              </div>
              
              {SHOP_ITEMS.map(item => {
                const purchaseCount = verifiedPurchaseCounts[item.id] || 0;
                const isDisabled = !!pendingVerification;
                const isSeason2 = (item as any).season === 2;
                const itemTag = (item as any).tag;
                
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
                      className={`w-full p-3 rounded-xl border transition-all text-left ${isDisabled ? 'opacity-50' : ''} ${
                        selectedItem?.id === item.id 
                          ? 'bg-[#627EEA]/20 border-[#627EEA]' 
                          : isSeason2 
                            ? 'bg-gradient-to-r from-purple-900/20 to-pink-900/20 border-purple-500/30 hover:border-purple-400/50' 
                            : 'bg-white/5 border-white/10 hover:border-[#D4AF37]/50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className={`text-2xl ${isSeason2 ? 'animate-pulse' : ''}`}>{item.emoji}</span>
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                              {item.name}
                              {itemTag && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                  itemTag === 'LEGENDARY' ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-black' :
                                  itemTag === 'EPIC' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' :
                                  'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                                }`}>
                                  {itemTag}
                                </span>
                              )}
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
                          <div className={`font-bold ${isSeason2 ? 'text-purple-400' : 'text-[#627EEA]'}`}>{item.priceETH} ETH</div>
                          <div className="text-xs text-gray-500">{item.priceUSD}</div>
                        </div>
                      </div>
                    </button>
                    
                    {selectedItem?.id === item.id && isConnected && !pendingVerification && (
                      <div className="mt-2 p-4 bg-gradient-to-b from-black/60 to-black/40 rounded-xl border border-white/10 space-y-4">
                        
                        {/* Price Breakdown */}
                        <div className="p-3 bg-white/5 rounded-lg">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-400 text-sm">Item Price</span>
                            <span className="text-white font-mono">{item.priceETH} ETH</span>
                          </div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-400 text-sm">Network Fee (est.)</span>
                            <span className="text-gray-300 font-mono text-sm">~$0.01</span>
                          </div>
                          <div className="border-t border-white/10 pt-2 mt-2">
                            <div className="flex justify-between items-center">
                              <span className="text-white font-medium">Total</span>
                              <span className="text-[#D4AF37] font-bold">{item.priceETH} ETH</span>
                            </div>
                          </div>
                        </div>

                        {/* What You Get */}
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <div className="text-green-400 text-xs font-medium mb-1">✨ What you get:</div>
                          <div className="text-green-300 text-sm">{item.description}</div>
                        </div>

                        {/* Transaction States */}
                        {isTxPending && (
                          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                              <span className="text-yellow-400 text-sm">Confirm in your wallet...</span>
                            </div>
                          </div>
                        )}

                        {isConfirming && (
                          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-center">
                            <div className="flex items-center justify-center gap-2 mb-1">
                              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                              <span className="text-blue-400 font-medium">Transaction Submitted!</span>
                            </div>
                            <div className="text-blue-300 text-xs">Confirming on Base... (~2 sec)</div>
                          </div>
                        )}

                        {isTxError && (
                          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                            <div className="text-red-400 text-sm">❌ Transaction failed or rejected</div>
                            <button 
                              onClick={() => resetTx()}
                              className="text-red-300 text-xs underline mt-1"
                            >
                              Try again
                            </button>
                          </div>
                        )}
                        
                        {/* Buy Button */}
                        {!isTxPending && !isConfirming && (
                          <button
                            onClick={() => {
                              // Send transaction with reasonable gas limit
                              sendTransaction({
                                to: INSTANT_BURN,
                                value: parseEther(item.priceETH),
                                data: encodeFunctionData({
                                  abi: INSTANT_BURN_ABI,
                                  functionName: 'buyAndBurn',
                                  args: [],
                                }),
                                gas: BigInt(150000), // Fixed gas limit to prevent overestimation
                              });
                            }}
                            disabled={!ethBalance || parseFloat(ethBalance.formatted) < parseFloat(item.priceETH)}
                            className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${
                              ethBalance && parseFloat(ethBalance.formatted) >= parseFloat(item.priceETH)
                                ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg shadow-orange-500/20'
                                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {ethBalance && parseFloat(ethBalance.formatted) < parseFloat(item.priceETH)
                              ? `Insufficient ETH (need ${item.priceETH})`
                              : `🔥 Pay ${item.priceETH} ETH & Burn BG`
                            }
                          </button>
                        )}
                        
                        {/* Cancel Button */}
                        <button
                          onClick={() => {
                            setSelectedItem(null);
                            setTxError(null);
                            setTxStatus('init');
                            resetTx();
                          }}
                          className="w-full py-2 text-gray-400 hover:text-white text-sm transition-all"
                        >
                          ✕ Cancel
                        </button>

                        {/* Security Note */}
                        <div className="text-[10px] text-gray-500 text-center">
                          🔐 Verified on Base blockchain • Effects apply after confirmation
                        </div>
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
                  onClick={() => appKit.open()}
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
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">🛒 Get Tokens</h2>
              <p className="text-xs text-gray-500">Buy ETH with card, then swap for BG</p>
            </div>

            {/* Step 1: Buy ETH */}
            <div className="mb-4 p-4 bg-[#0052FF]/10 border border-[#0052FF]/30 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-[#0052FF] flex items-center justify-center text-white text-xs font-bold">1</div>
                <div className="text-sm font-medium text-white">Buy ETH on Base</div>
              </div>
              <BuyEthButton 
                address={address}
                className="w-full p-4 bg-[#0052FF] hover:bg-[#0040CC] rounded-xl transition-all flex items-center justify-center gap-3"
              />
              <p className="text-xs text-gray-500 text-center mt-2">Opens Coinbase Pay → Base ETH</p>
            </div>

            {/* Step 2: Swap to BG */}
            <div className="mb-4 p-4 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-[#D4AF37] flex items-center justify-center text-black text-xs font-bold">2</div>
                <div className="text-sm font-medium text-white">Swap ETH → BG</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <a 
                  href="https://aerodrome.finance/swap?from=eth&to=0x36b712A629095234F2196BbB000D1b96C12Ce78e" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="p-3 bg-blue-500/20 border border-blue-500/40 rounded-lg hover:bg-blue-500/30 transition-all text-center group"
                >
                  <div className="text-xl mb-1 group-hover:scale-110 transition-transform">🔵</div>
                  <div className="text-blue-400 font-bold text-sm">Aerodrome</div>
                  <div className="text-xs text-gray-500">Best liquidity</div>
                </a>
                <a 
                  href="https://app.uniswap.org/swap?outputCurrency=0x36b712A629095234F2196BbB000D1b96C12Ce78e&chain=base" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="p-3 bg-pink-500/20 border border-pink-500/40 rounded-lg hover:bg-pink-500/30 transition-all text-center group"
                >
                  <div className="text-xl mb-1 group-hover:scale-110 transition-transform">🦄</div>
                  <div className="text-pink-400 font-bold text-sm">Uniswap</div>
                  <div className="text-xs text-gray-500">Popular DEX</div>
                </a>
              </div>
            </div>

            {/* Current Balances */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* ETH Balance */}
              <div className="p-3 bg-[#627EEA]/10 border border-[#627EEA]/30 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-[#627EEA] flex items-center justify-center text-white text-xs font-bold">Ξ</div>
                  <div className="text-xs text-gray-400">ETH</div>
                </div>
                <div className="text-lg font-bold text-white font-mono">
                  {isConnected && ethBalance ? parseFloat(ethBalance.formatted).toFixed(4) : '0.0000'}
                </div>
              </div>

              {/* BG Balance */}
              <div className="p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#996515] flex items-center justify-center text-[8px] font-bold text-black">BG</div>
                  <div className="text-xs text-gray-400">BaseGold</div>
                </div>
                <div className="text-lg font-bold text-[#D4AF37] font-mono">
                  {isConnected && bgBalance ? parseFloat(bgBalance.formatted).toFixed(4) : '0.0000'}
                </div>
              </div>
            </div>

            {/* Bridge Option */}
            <div className="mb-4 p-3 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">🌉 Bridge from other chains</div>
                  <div className="text-xs text-gray-500">Move ETH from Ethereum, Arbitrum, etc.</div>
                </div>
                <a 
                  href="https://relay.link/bridge/base" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-all"
                >
                  Bridge →
                </a>
              </div>
            </div>

            {/* Contract Info */}
            <div className="p-3 bg-white/5 rounded-lg">
              <div className="text-xs text-gray-500 mb-1">BG Token Contract:</div>
              <div className="flex items-center justify-between">
                <code className="text-xs text-[#D4AF37] font-mono">0x36b712A629095234F2196BbB000D1b96C12Ce78e</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText('0x36b712A629095234F2196BbB000D1b96C12Ce78e');
                  }}
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-gray-400 hover:text-white transition-all"
                >
                  Copy
                </button>
              </div>
            </div>

            {!isConnected && (
              <div className="mt-4 text-center">
                <p className="text-gray-400 text-sm mb-2">Connect wallet to get started</p>
                <button
                  onClick={() => appKit.open()}
                  className="px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#996515] text-black font-bold rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/20 transition-all"
                >
                  🔗 Connect Wallet
                </button>
              </div>
            )}
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
        
        @keyframes notifSlideIn {
          0% { opacity: 0; transform: translateX(-50%) translateY(-100px) scale(0.5); }
          50% { opacity: 1; transform: translateX(-50%) translateY(10px) scale(1.1); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        
        @keyframes notifPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(212, 175, 55, 0.5); }
          50% { box-shadow: 0 0 40px rgba(212, 175, 55, 0.8), 0 0 60px rgba(212, 175, 55, 0.4); }
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
