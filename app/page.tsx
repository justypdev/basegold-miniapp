'use client';

import { useEffect, useState, useCallback } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { useAccount, useBalance, useReadContract, useWatchContractEvent, usePublicClient } from 'wagmi';
import { 
  Transaction, 
  TransactionButton, 
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction 
} from '@coinbase/onchainkit/transaction';
import { ConnectWallet, Wallet } from '@coinbase/onchainkit/wallet';
import { Avatar, Name } from '@coinbase/onchainkit/identity';
import { encodeFunctionData, parseUnits, formatUnits, parseEther, parseAbiItem } from 'viem';
import { base } from 'wagmi/chains';

// ============ CONTRACT ADDRESSES (Base Mainnet) ============

// BaseGold Token
const BG_TOKEN = '0x36b712A629095234F2196BbB000D1b96C12Ce78e' as `0x${string}`;

// InstantBurn Contract (DEPLOYED!)
const INSTANT_BURN = '0x2b9e43b98dE8603aEef1a405B9e953A0091D0C08' as `0x${string}`;

// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;

// Aerodrome Router for Buy BG swaps
const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as `0x${string}`;

// WETH on Base
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as `0x${string}`;

// Dead address for burn tracking
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as `0x${string}`;

// Initial supply for burn calculation
const INITIAL_SUPPLY = 10000;

// ============ ABIs ============

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
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
    name: 'purchaseAndBurn',
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }, { name: 'itemId', type: 'string' }],
    outputs: [],
  },
  {
    name: 'getStats',
    type: 'function',
    inputs: [],
    outputs: [
      { name: '_totalUsdcReceived', type: 'uint256' },
      { name: '_totalBgBurned', type: 'uint256' },
      { name: '_totalBurns', type: 'uint256' }
    ],
    stateMutability: 'view',
  },
  {
    name: 'InstantBurn',
    type: 'event',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'usdcAmount', type: 'uint256', indexed: false },
      { name: 'bgBurned', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
      { name: 'totalBurnedLifetime', type: 'uint256', indexed: false },
    ],
  },
] as const;

const ROUTER_ABI = [
  {
    name: 'swapExactETHForTokens',
    type: 'function',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256[]' }],
    stateMutability: 'payable',
  },
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256[]' }],
  },
] as const;

// ============ SHOP ITEMS ============

const SHOP_ITEMS = [
  {
    id: 'boost_2x',
    name: '⚡ 2x Power Boost',
    description: 'Double click power for 10 minutes',
    priceUSDC: '0.50',
    emoji: '⚡',
    effect: { type: 'boost', multiplier: 2, duration: 600000 }
  },
  {
    id: 'time_warp',
    name: '⏰ Time Warp',
    description: 'Instantly collect 1 hour of passive gold',
    priceUSDC: '1.00',
    emoji: '⏰',
    effect: { type: 'instant_gold', hours: 1 }
  },
  {
    id: 'diamond_pickaxe',
    name: '💎 Diamond Pickaxe',
    description: 'Permanent +10 gold per click',
    priceUSDC: '2.00',
    emoji: '💎',
    effect: { type: 'permanent_click', amount: 10 }
  },
  {
    id: 'auto_miner',
    name: '🤖 Auto-Miner Bot',
    description: 'Permanent +100 gold per second',
    priceUSDC: '5.00',
    emoji: '🤖',
    effect: { type: 'permanent_passive', amount: 100 }
  },
  {
    id: 'golden_crown',
    name: '👑 Golden Crown',
    description: 'Exclusive cosmetic + 15x combo max',
    priceUSDC: '3.00',
    emoji: '👑',
    effect: { type: 'cosmetic', maxCombo: 15 }
  },
  {
    id: 'burn_booster',
    name: '🔥 Burn Booster',
    description: '100% goes directly to burn!',
    priceUSDC: '1.00',
    emoji: '🔥',
    effect: { type: 'burn_contribution', amount: 1 }
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

// ============ LEADERBOARD TYPES ============

interface BurnEntry {
  address: string;
  totalBurned: number;
  burnCount: number;
}

interface PointsEntry {
  address: string;
  name: string;
  gold: number;
  totalClicks: number;
  timestamp: number;
}

// ============ ACHIEVEMENTS SYSTEM ============

interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: 'mining' | 'burning' | 'shopping' | 'mastery';
  points: number;
  requirement: {
    type: 'clicks' | 'gold' | 'goldPerSec' | 'combo' | 'upgrades' | 'burns' | 'burnAmount' | 'purchases' | 'playTime';
    value: number;
  };
  tier: 'bronze' | 'silver' | 'gold' | 'diamond' | 'legendary';
}

const ACHIEVEMENTS: Achievement[] = [
  // Mining Achievements
  { id: 'first_click', name: 'First Steps', description: 'Click the gold coin for the first time', emoji: '👆', category: 'mining', points: 10, requirement: { type: 'clicks', value: 1 }, tier: 'bronze' },
  { id: 'clicks_100', name: 'Getting Started', description: 'Reach 100 total clicks', emoji: '⛏️', category: 'mining', points: 25, requirement: { type: 'clicks', value: 100 }, tier: 'bronze' },
  { id: 'clicks_1000', name: 'Dedicated Miner', description: 'Reach 1,000 total clicks', emoji: '💪', category: 'mining', points: 50, requirement: { type: 'clicks', value: 1000 }, tier: 'silver' },
  { id: 'clicks_10000', name: 'Click Master', description: 'Reach 10,000 total clicks', emoji: '🏆', category: 'mining', points: 100, requirement: { type: 'clicks', value: 10000 }, tier: 'gold' },
  { id: 'clicks_100000', name: 'Legendary Clicker', description: 'Reach 100,000 total clicks', emoji: '👑', category: 'mining', points: 250, requirement: { type: 'clicks', value: 100000 }, tier: 'legendary' },
  
  { id: 'gold_1000', name: 'Gold Hoarder', description: 'Accumulate 1,000 gold', emoji: '💰', category: 'mining', points: 25, requirement: { type: 'gold', value: 1000 }, tier: 'bronze' },
  { id: 'gold_10000', name: 'Wealthy Miner', description: 'Accumulate 10,000 gold', emoji: '💎', category: 'mining', points: 50, requirement: { type: 'gold', value: 10000 }, tier: 'silver' },
  { id: 'gold_100000', name: 'Gold Tycoon', description: 'Accumulate 100,000 gold', emoji: '🏦', category: 'mining', points: 100, requirement: { type: 'gold', value: 100000 }, tier: 'gold' },
  { id: 'gold_1000000', name: 'Millionaire', description: 'Accumulate 1,000,000 gold', emoji: '💵', category: 'mining', points: 200, requirement: { type: 'gold', value: 1000000 }, tier: 'diamond' },
  { id: 'gold_100000000', name: 'Billionaire', description: 'Accumulate 100,000,000 gold', emoji: '🤑', category: 'mining', points: 500, requirement: { type: 'gold', value: 100000000 }, tier: 'legendary' },

  { id: 'passive_10', name: 'Passive Income', description: 'Reach 10 gold per second', emoji: '⏰', category: 'mining', points: 30, requirement: { type: 'goldPerSec', value: 10 }, tier: 'bronze' },
  { id: 'passive_100', name: 'Money Machine', description: 'Reach 100 gold per second', emoji: '🤖', category: 'mining', points: 75, requirement: { type: 'goldPerSec', value: 100 }, tier: 'silver' },
  { id: 'passive_1000', name: 'Gold Factory', description: 'Reach 1,000 gold per second', emoji: '🏭', category: 'mining', points: 150, requirement: { type: 'goldPerSec', value: 1000 }, tier: 'gold' },

  { id: 'combo_5', name: 'Combo Starter', description: 'Reach a 5x combo', emoji: '🔥', category: 'mining', points: 20, requirement: { type: 'combo', value: 5 }, tier: 'bronze' },
  { id: 'combo_10', name: 'Combo King', description: 'Reach a 10x combo', emoji: '⚡', category: 'mining', points: 50, requirement: { type: 'combo', value: 10 }, tier: 'silver' },
  { id: 'combo_15', name: 'Combo Legend', description: 'Reach a 15x combo (requires Crown)', emoji: '👑', category: 'mining', points: 100, requirement: { type: 'combo', value: 15 }, tier: 'gold' },

  { id: 'upgrades_5', name: 'Upgrader', description: 'Own 5 total upgrades', emoji: '⬆️', category: 'mining', points: 30, requirement: { type: 'upgrades', value: 5 }, tier: 'bronze' },
  { id: 'upgrades_20', name: 'Fully Equipped', description: 'Own 20 total upgrades', emoji: '🛠️', category: 'mining', points: 75, requirement: { type: 'upgrades', value: 20 }, tier: 'silver' },
  { id: 'upgrades_50', name: 'Mining Empire', description: 'Own 50 total upgrades', emoji: '🏔️', category: 'mining', points: 150, requirement: { type: 'upgrades', value: 50 }, tier: 'gold' },

  // Burning Achievements (On-Chain!)
  { id: 'first_burn', name: 'First Burn', description: 'Contribute to your first BG burn', emoji: '🔥', category: 'burning', points: 50, requirement: { type: 'burns', value: 1 }, tier: 'bronze' },
  { id: 'burns_5', name: 'Burn Enthusiast', description: 'Contribute to 5 BG burns', emoji: '🔥', category: 'burning', points: 100, requirement: { type: 'burns', value: 5 }, tier: 'silver' },
  { id: 'burns_10', name: 'Serial Burner', description: 'Contribute to 10 BG burns', emoji: '🔥', category: 'burning', points: 150, requirement: { type: 'burns', value: 10 }, tier: 'gold' },
  { id: 'burns_25', name: 'Burn Master', description: 'Contribute to 25 BG burns', emoji: '🔥', category: 'burning', points: 250, requirement: { type: 'burns', value: 25 }, tier: 'diamond' },
  { id: 'burns_100', name: 'Legendary Burner', description: 'Contribute to 100 BG burns', emoji: '🔥', category: 'burning', points: 500, requirement: { type: 'burns', value: 100 }, tier: 'legendary' },

  { id: 'burn_amount_0001', name: 'Spark', description: 'Burn 0.0001 BG total', emoji: '✨', category: 'burning', points: 50, requirement: { type: 'burnAmount', value: 0.0001 }, tier: 'bronze' },
  { id: 'burn_amount_001', name: 'Flame', description: 'Burn 0.001 BG total', emoji: '🕯️', category: 'burning', points: 100, requirement: { type: 'burnAmount', value: 0.001 }, tier: 'silver' },
  { id: 'burn_amount_01', name: 'Inferno', description: 'Burn 0.01 BG total', emoji: '🔥', category: 'burning', points: 200, requirement: { type: 'burnAmount', value: 0.01 }, tier: 'gold' },
  { id: 'burn_amount_1', name: 'Firestorm', description: 'Burn 0.1 BG total', emoji: '🌋', category: 'burning', points: 400, requirement: { type: 'burnAmount', value: 0.1 }, tier: 'diamond' },
  { id: 'burn_amount_10', name: 'Supernova', description: 'Burn 1 BG total', emoji: '💥', category: 'burning', points: 1000, requirement: { type: 'burnAmount', value: 1 }, tier: 'legendary' },

  // Shopping Achievements
  { id: 'first_purchase', name: 'First Purchase', description: 'Buy your first premium item', emoji: '🛒', category: 'shopping', points: 25, requirement: { type: 'purchases', value: 1 }, tier: 'bronze' },
  { id: 'purchases_5', name: 'Regular Customer', description: 'Make 5 premium purchases', emoji: '🛍️', category: 'shopping', points: 75, requirement: { type: 'purchases', value: 5 }, tier: 'silver' },
  { id: 'purchases_10', name: 'Big Spender', description: 'Make 10 premium purchases', emoji: '💳', category: 'shopping', points: 150, requirement: { type: 'purchases', value: 10 }, tier: 'gold' },
  { id: 'purchases_25', name: 'VIP Customer', description: 'Make 25 premium purchases', emoji: '⭐', category: 'shopping', points: 300, requirement: { type: 'purchases', value: 25 }, tier: 'diamond' },

  // Mastery Achievements
  { id: 'achievement_hunter', name: 'Achievement Hunter', description: 'Unlock 10 achievements', emoji: '🎯', category: 'mastery', points: 100, requirement: { type: 'clicks', value: 0 }, tier: 'silver' },
  { id: 'completionist', name: 'Completionist', description: 'Unlock 25 achievements', emoji: '🏅', category: 'mastery', points: 250, requirement: { type: 'clicks', value: 0 }, tier: 'gold' },
  { id: 'true_master', name: 'True Master', description: 'Unlock all achievements', emoji: '🌟', category: 'mastery', points: 1000, requirement: { type: 'clicks', value: 0 }, tier: 'legendary' },
];

const TIER_COLORS = {
  bronze: 'from-orange-700 to-orange-900',
  silver: 'from-gray-300 to-gray-500',
  gold: 'from-yellow-400 to-yellow-600',
  diamond: 'from-cyan-300 to-blue-500',
  legendary: 'from-purple-400 to-pink-500',
};

const TIER_BORDERS = {
  bronze: 'border-orange-700',
  silver: 'border-gray-400',
  gold: 'border-yellow-500',
  diamond: 'border-cyan-400',
  legendary: 'border-purple-500',
};

// ============ BURN NOTIFICATION COMPONENT ============

function BurnNotification({ burn, onComplete }: { burn: { amount: string; buyer: string }; onComplete: () => void }) {
  useEffect(() => {
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

// ============ ACHIEVEMENT NOTIFICATION COMPONENT ============

function AchievementNotification({ achievement, onComplete }: { achievement: Achievement; onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 5000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed top-32 left-1/2 -translate-x-1/2 z-50">
      <div className={`bg-gradient-to-r ${TIER_COLORS[achievement.tier]} px-6 py-4 rounded-xl shadow-2xl border-2 ${TIER_BORDERS[achievement.tier]}`}>
        <div className="text-center">
          <div className="text-xs text-white/80 uppercase tracking-wider mb-1">Achievement Unlocked!</div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl">{achievement.emoji}</span>
            <div>
              <div className="text-white font-bold">{achievement.name}</div>
              <div className="text-white/80 text-xs">+{achievement.points} points</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============

export default function MinerGame() {
  const [isReady, setIsReady] = useState(false);
  
  // Wallet
  const { address, isConnected } = useAccount();
  const { data: ethBalance } = useBalance({ address });
  const { data: usdcBalance } = useBalance({ address, token: USDC_ADDRESS });
  const { data: bgBalance } = useBalance({ address, token: BG_TOKEN });
  
  // Public client for reading events
  const publicClient = usePublicClient();

  // Live burn tracking from blockchain
  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: BG_TOKEN,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  });

  const { data: contractBalance } = useReadContract({
    address: BG_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [BG_TOKEN],
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
    functionName: 'getStats',
  });

  // Game state
  const [gold, setGold] = useState(0);
  const [goldPerClick, setGoldPerClick] = useState(1);
  const [goldPerSecond, setGoldPerSecond] = useState(0);
  const [totalClicks, setTotalClicks] = useState(0);
  const [combo, setCombo] = useState(1);
  const [maxCombo, setMaxCombo] = useState(10);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [upgrades, setUpgrades] = useState(INITIAL_UPGRADES);
  const [clickMultiplier, setClickMultiplier] = useState(1);
  const [boostEndTime, setBoostEndTime] = useState<number | null>(null);
  const [hasCrown, setHasCrown] = useState(false);
  
  // UI state
  const [activeTab, setActiveTab] = useState<'game' | 'shop' | 'buy' | 'achievements' | 'leaderboard' | 'stats'>('game');
  const [floatingTexts, setFloatingTexts] = useState<Array<{id: number, text: string, x: number, y: number}>>([]);
  const [selectedItem, setSelectedItem] = useState<typeof SHOP_ITEMS[0] | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  
  // Buy BG state (for future use in shop)
  const [buyAmount, setBuyAmount] = useState('');
  const [buyToken, setBuyToken] = useState<'ETH' | 'USDC'>('ETH');
  
  // Real-time burn notifications
  const [burnNotifications, setBurnNotifications] = useState<Array<{ id: number; amount: string; buyer: string }>>([]);
  const [totalBurned, setTotalBurned] = useState(0);
  const [lastBurnAmount, setLastBurnAmount] = useState<string | null>(null);
  
  // Leaderboard state
  const [burnLeaderboard, setBurnLeaderboard] = useState<BurnEntry[]>([]);
  const [pointsLeaderboard, setPointsLeaderboard] = useState<PointsEntry[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'burns' | 'points'>('burns');
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [playerName, setPlayerName] = useState('');
  
  // Achievement state
  const [unlockedAchievements, setUnlockedAchievements] = useState<Set<string>>(new Set());
  const [achievementNotifications, setAchievementNotifications] = useState<Achievement[]>([]);
  const [achievementCategory, setAchievementCategory] = useState<'all' | 'mining' | 'burning' | 'shopping' | 'mastery'>('all');
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [userBurnCount, setUserBurnCount] = useState(0);
  const [userBurnAmount, setUserBurnAmount] = useState(0);
  const [highestCombo, setHighestCombo] = useState(1);

  // Watch for InstantBurn events (real-time!)
  useWatchContractEvent({
    address: INSTANT_BURN,
    abi: INSTANT_BURN_ABI,
    eventName: 'InstantBurn',
    onLogs(logs) {
      logs.forEach((log: any) => {
        const bgBurned = formatUnits(log.args.bgBurned || 0n, 18);
        const buyer = log.args.buyer?.slice(0, 6) + '...' + log.args.buyer?.slice(-4);
        
        // Add notification
        const id = Date.now();
        setBurnNotifications(prev => [...prev, { id, amount: parseFloat(bgBurned).toFixed(6), buyer }]);
        
        // Update stats
        setLastBurnAmount(bgBurned);
        refetchSupply();
        refetchBurnStats();
        
        // Refresh burn leaderboard
        fetchBurnLeaderboard();
      });
    },
  });

  // Fetch burn leaderboard from blockchain events
  const fetchBurnLeaderboard = useCallback(async () => {
    if (!publicClient) return;
    
    setLoadingLeaderboard(true);
    try {
      const logs = await publicClient.getLogs({
        address: INSTANT_BURN,
        event: parseAbiItem('event InstantBurn(address indexed buyer, uint256 usdcAmount, uint256 bgBurned, uint256 timestamp, uint256 totalBurnedLifetime)'),
        fromBlock: 'earliest',
        toBlock: 'latest',
      });

      // Aggregate by address
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

      // Convert to array and sort
      const leaderboard: BurnEntry[] = Object.entries(burnsByAddress)
        .map(([address, data]) => ({
          address,
          totalBurned: data.totalBurned,
          burnCount: data.burnCount,
        }))
        .sort((a, b) => b.totalBurned - a.totalBurned)
        .slice(0, 50); // Top 50

      setBurnLeaderboard(leaderboard);
    } catch (error) {
      console.error('Error fetching burn leaderboard:', error);
    }
    setLoadingLeaderboard(false);
  }, [publicClient]);

  // Load points leaderboard from localStorage (shared via simple API later)
  const loadPointsLeaderboard = useCallback(() => {
    try {
      const saved = localStorage.getItem('basegold-points-leaderboard');
      if (saved) {
        const data = JSON.parse(saved) as PointsEntry[];
        setPointsLeaderboard(data.sort((a, b) => b.gold - a.gold).slice(0, 50));
      }
    } catch {}
  }, []);

  // Submit score to points leaderboard
  const submitScore = useCallback(() => {
    if (!address || gold < 100) return;
    
    const name = playerName.trim() || address.slice(0, 6) + '...' + address.slice(-4);
    
    try {
      const saved = localStorage.getItem('basegold-points-leaderboard');
      let leaderboard: PointsEntry[] = saved ? JSON.parse(saved) : [];
      
      // Update or add entry
      const existingIndex = leaderboard.findIndex(e => e.address.toLowerCase() === address.toLowerCase());
      const newEntry: PointsEntry = {
        address,
        name,
        gold,
        totalClicks,
        timestamp: Date.now(),
      };
      
      if (existingIndex >= 0) {
        // Only update if new score is higher
        if (gold > leaderboard[existingIndex].gold) {
          leaderboard[existingIndex] = newEntry;
        }
      } else {
        leaderboard.push(newEntry);
      }
      
      // Sort and save
      leaderboard = leaderboard.sort((a, b) => b.gold - a.gold).slice(0, 100);
      localStorage.setItem('basegold-points-leaderboard', JSON.stringify(leaderboard));
      setPointsLeaderboard(leaderboard.slice(0, 50));
      
      alert('Score submitted! 🏆');
    } catch (error) {
      console.error('Error submitting score:', error);
    }
  }, [address, gold, totalClicks, playerName]);

  // Fetch leaderboards on tab change
  useEffect(() => {
    if (activeTab === 'leaderboard') {
      fetchBurnLeaderboard();
      loadPointsLeaderboard();
    }
  }, [activeTab, fetchBurnLeaderboard, loadPointsLeaderboard]);

  // Load player name from localStorage
  useEffect(() => {
    const savedName = localStorage.getItem('basegold-player-name');
    if (savedName) setPlayerName(savedName);
  }, []);

  // Save player name
  useEffect(() => {
    if (playerName) {
      localStorage.setItem('basegold-player-name', playerName);
    }
  }, [playerName]);

  // Load achievements from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('basegold-achievements');
      if (saved) {
        const data = JSON.parse(saved);
        setUnlockedAchievements(new Set(data.unlocked || []));
        setTotalPurchases(data.totalPurchases || 0);
        setHighestCombo(data.highestCombo || 1);
      }
    } catch {}
  }, []);

  // Save achievements
  useEffect(() => {
    localStorage.setItem('basegold-achievements', JSON.stringify({
      unlocked: Array.from(unlockedAchievements),
      totalPurchases,
      highestCombo,
    }));
  }, [unlockedAchievements, totalPurchases, highestCombo]);

  // Fetch user's burn stats from blockchain
  const fetchUserBurnStats = useCallback(async () => {
    if (!publicClient || !address) return;
    
    try {
      const logs = await publicClient.getLogs({
        address: INSTANT_BURN,
        event: parseAbiItem('event InstantBurn(address indexed buyer, uint256 usdcAmount, uint256 bgBurned, uint256 timestamp, uint256 totalBurnedLifetime)'),
        args: { buyer: address },
        fromBlock: 'earliest',
        toBlock: 'latest',
      });

      let totalBurned = 0;
      logs.forEach((log: any) => {
        totalBurned += Number(formatUnits(log.args.bgBurned || 0n, 18));
      });

      setUserBurnCount(logs.length);
      setUserBurnAmount(totalBurned);
    } catch (error) {
      console.error('Error fetching user burn stats:', error);
    }
  }, [publicClient, address]);

  // Fetch user burn stats when address changes
  useEffect(() => {
    if (address) {
      fetchUserBurnStats();
    }
  }, [address, fetchUserBurnStats]);

  // Calculate total upgrades owned
  const totalUpgradesOwned = Object.values(upgrades).reduce((sum, u) => sum + u.owned, 0);

  // Check and unlock achievements
  const checkAchievements = useCallback(() => {
    const newUnlocks: Achievement[] = [];
    
    ACHIEVEMENTS.forEach(achievement => {
      if (unlockedAchievements.has(achievement.id)) return;
      
      let unlocked = false;
      
      switch (achievement.requirement.type) {
        case 'clicks':
          // Special handling for mastery achievements
          if (achievement.id === 'achievement_hunter') {
            unlocked = unlockedAchievements.size >= 10;
          } else if (achievement.id === 'completionist') {
            unlocked = unlockedAchievements.size >= 25;
          } else if (achievement.id === 'true_master') {
            unlocked = unlockedAchievements.size >= ACHIEVEMENTS.length - 1;
          } else {
            unlocked = totalClicks >= achievement.requirement.value;
          }
          break;
        case 'gold':
          unlocked = gold >= achievement.requirement.value;
          break;
        case 'goldPerSec':
          unlocked = goldPerSecond >= achievement.requirement.value;
          break;
        case 'combo':
          unlocked = highestCombo >= achievement.requirement.value;
          break;
        case 'upgrades':
          unlocked = totalUpgradesOwned >= achievement.requirement.value;
          break;
        case 'burns':
          unlocked = userBurnCount >= achievement.requirement.value;
          break;
        case 'burnAmount':
          unlocked = userBurnAmount >= achievement.requirement.value;
          break;
        case 'purchases':
          unlocked = totalPurchases >= achievement.requirement.value;
          break;
      }
      
      if (unlocked) {
        newUnlocks.push(achievement);
      }
    });
    
    if (newUnlocks.length > 0) {
      setUnlockedAchievements(prev => {
        const updated = new Set(prev);
        newUnlocks.forEach(a => updated.add(a.id));
        return updated;
      });
      
      // Queue notifications
      newUnlocks.forEach((achievement, index) => {
        setTimeout(() => {
          setAchievementNotifications(prev => [...prev, achievement]);
        }, index * 1500);
      });
    }
  }, [gold, totalClicks, goldPerSecond, highestCombo, totalUpgradesOwned, userBurnCount, userBurnAmount, totalPurchases, unlockedAchievements]);

  // Check achievements when relevant values change
  useEffect(() => {
    checkAchievements();
  }, [checkAchievements]);

  // Update highest combo
  useEffect(() => {
    if (combo > highestCombo) {
      setHighestCombo(combo);
    }
  }, [combo, highestCombo]);

  // Calculate achievement score
  const achievementScore = ACHIEVEMENTS
    .filter(a => unlockedAchievements.has(a.id))
    .reduce((sum, a) => sum + a.points, 0);
  
  const maxAchievementScore = ACHIEVEMENTS.reduce((sum, a) => sum + a.points, 0);

  // Calculate total burned
  useEffect(() => {
    if (totalSupply) {
      const supply = Number(formatUnits(totalSupply as bigint, 18));
      const stuck = contractBalance ? Number(formatUnits(contractBalance as bigint, 18)) : 0;
      const dead = deadBalance ? Number(formatUnits(deadBalance as bigint, 18)) : 0;
      const burned = INITIAL_SUPPLY - supply + stuck + dead;
      setTotalBurned(burned);
    }
  }, [totalSupply, contractBalance, deadBalance]);

  // Initialize MiniKit
  useEffect(() => {
    const init = async () => {
      try {
        await sdk.actions.ready();
      } catch {}
      setIsReady(true);
    };
    init();
  }, []);

  // Load/save game
  useEffect(() => {
    const saved = localStorage.getItem('basegold-miner-v2');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setGold(data.gold || 0);
        setGoldPerClick(data.goldPerClick || 1);
        setGoldPerSecond(data.goldPerSecond || 0);
        setTotalClicks(data.totalClicks || 0);
        setMaxCombo(data.maxCombo || 10);
        setHasCrown(data.hasCrown || false);
        if (data.upgrades) setUpgrades(prev => ({ ...prev, ...data.upgrades }));
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('basegold-miner-v2', JSON.stringify({
      gold, goldPerClick, goldPerSecond, totalClicks, maxCombo, hasCrown, upgrades
    }));
  }, [gold, goldPerClick, goldPerSecond, totalClicks, maxCombo, hasCrown, upgrades]);

  // Passive income
  useEffect(() => {
    const interval = setInterval(() => {
      if (goldPerSecond > 0) setGold(prev => prev + goldPerSecond);
    }, 1000);
    return () => clearInterval(interval);
  }, [goldPerSecond]);

  // Boost timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (boostEndTime && Date.now() >= boostEndTime) {
        setClickMultiplier(1);
        setBoostEndTime(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [boostEndTime]);

  // Refresh data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refetchSupply();
      refetchBurnStats();
    }, 15000);
    return () => clearInterval(interval);
  }, [refetchSupply, refetchBurnStats]);

  // Handle click
  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    let newCombo = now - lastClickTime < 500 ? Math.min(combo + 1, maxCombo) : 1;
    setCombo(newCombo);
    setLastClickTime(now);
    
    const earned = Math.floor(goldPerClick * clickMultiplier * newCombo);
    setGold(prev => prev + earned);
    setTotalClicks(prev => prev + 1);
    
    const id = Date.now();
    setFloatingTexts(prev => [...prev, { id, text: `+${formatNumber(earned)}`, x, y }]);
    setTimeout(() => setFloatingTexts(prev => prev.filter(ft => ft.id !== id)), 1000);
  }, [combo, lastClickTime, goldPerClick, clickMultiplier, maxCombo]);

  // Buy upgrade
  const buyUpgrade = (key: keyof typeof upgrades) => {
    const upgrade = upgrades[key];
    if (gold >= upgrade.cost) {
      setGold(prev => prev - upgrade.cost);
      setUpgrades(prev => ({
        ...prev,
        [key]: { ...prev[key], owned: prev[key].owned + 1, cost: Math.floor(prev[key].cost * prev[key].multiplier) }
      }));
      setGoldPerClick(prev => prev + upgrade.perClick);
      setGoldPerSecond(prev => prev + upgrade.perSec);
    }
  };

  // Apply purchase effect
  const applyPurchaseEffect = (item: typeof SHOP_ITEMS[0]) => {
    const effect = item.effect;
    switch (effect.type) {
      case 'boost':
        setClickMultiplier(effect.multiplier || 2);
        setBoostEndTime(Date.now() + (effect.duration || 600000));
        break;
      case 'instant_gold':
        setGold(prev => prev + (goldPerSecond * 3600 * (effect.hours || 1)));
        break;
      case 'permanent_click':
        setGoldPerClick(prev => prev + (effect.amount || 10));
        break;
      case 'permanent_passive':
        setGoldPerSecond(prev => prev + (effect.amount || 100));
        break;
      case 'cosmetic':
        setHasCrown(true);
        setMaxCombo(effect.maxCombo || 15);
        break;
    }
    // Track purchase for achievements
    setTotalPurchases(prev => prev + 1);
    // Refresh burn stats (purchase triggers burn)
    setTimeout(() => fetchUserBurnStats(), 3000);
    
    setPurchaseSuccess(true);
    setTimeout(() => setPurchaseSuccess(false), 3000);
  };

  const formatNumber = (num: number) => {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return Math.floor(num).toString();
  };

  // Build purchase transaction (approve + purchaseAndBurn)
  const buildPurchaseCalls = (priceUSDC: string, itemId: string) => {
    const amount = parseUnits(priceUSDC, 6);
    return [
      {
        to: USDC_ADDRESS,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [INSTANT_BURN, amount],
        }),
      },
      {
        to: INSTANT_BURN,
        data: encodeFunctionData({
          abi: INSTANT_BURN_ABI,
          functionName: 'purchaseAndBurn',
          args: [amount, itemId],
        }),
      },
    ];
  };

  // Build Buy BG transaction
  const buildBuyBGCalls = () => {
    if (!buyAmount || !address) return [];
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    
    if (buyToken === 'ETH') {
      const amountIn = parseEther(buyAmount);
      return [{
        to: AERODROME_ROUTER,
        value: amountIn,
        data: encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: 'swapExactETHForTokens',
          args: [
            0n,
            [WETH_ADDRESS, BG_TOKEN],
            address,
            deadline,
          ],
        }),
      }];
    } else {
      const amountIn = parseUnits(buyAmount, 6);
      return [
        {
          to: USDC_ADDRESS,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [AERODROME_ROUTER, amountIn],
          }),
        },
        {
          to: AERODROME_ROUTER,
          data: encodeFunctionData({
            abi: ROUTER_ABI,
            functionName: 'swapExactTokensForTokens',
            args: [
              amountIn,
              0n,
              [USDC_ADDRESS, BG_TOKEN],
              address,
              deadline,
            ],
          }),
        },
      ];
    }
  };

  // Parse burn stats
  const burnStatsArray = burnStats as [bigint, bigint, bigint] | undefined;
  const lifetimeUsdcBurned = burnStatsArray ? Number(formatUnits(burnStatsArray[0], 6)) : 0;
  const lifetimeBgBurned = burnStatsArray ? Number(formatUnits(burnStatsArray[1], 18)) : 0;
  const totalBurnCount = burnStatsArray ? Number(burnStatsArray[2]) : 0;

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
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Burn Notifications */}
      {burnNotifications.map(burn => (
        <BurnNotification
          key={burn.id}
          burn={burn}
          onComplete={() => setBurnNotifications(prev => prev.filter(b => b.id !== burn.id))}
        />
      ))}

      {/* Achievement Notifications */}
      {achievementNotifications.map((achievement, index) => (
        <AchievementNotification
          key={`${achievement.id}-${index}`}
          achievement={achievement}
          onComplete={() => setAchievementNotifications(prev => prev.filter((_, i) => i !== 0))}
        />
      ))}

      {/* Header */}
      <header className="flex justify-between items-center p-3 border-b border-[#D4AF37]/20">
        <div className="flex items-center gap-2">
          <span className="text-xl">⛏️</span>
          <span className="text-sm font-bold text-[#D4AF37]">BASEGOLD MINER</span>
          {hasCrown && <span>👑</span>}
        </div>
        <Wallet>
          <ConnectWallet>
            <Avatar className="w-5 h-5" />
            <Name className="text-xs" />
          </ConnectWallet>
        </Wallet>
      </header>

      {/* Live Burn Ticker */}
      <div className="bg-gradient-to-r from-red-900/30 via-orange-900/30 to-red-900/30 border-b border-orange-500/30 py-2 px-4">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-lg animate-pulse">🔥</span>
            <div>
              <div className="text-xs text-gray-400">Total Burned</div>
              <div className="text-orange-400 font-bold font-mono">
                {totalBurned.toFixed(4)} BG
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Circulating</div>
            <div className="text-[#D4AF37] font-mono">
              {(INITIAL_SUPPLY - totalBurned).toFixed(2)} / 10,000
            </div>
          </div>
        </div>
      </div>

      {/* Your BG Balance Display - Always Visible */}
      <div className="bg-gradient-to-r from-[#D4AF37]/10 via-[#996515]/10 to-[#D4AF37]/10 border-b border-[#D4AF37]/30 py-3 px-4">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] flex items-center justify-center text-[#996515] font-bold text-sm border-2 border-[#996515]">
              BG
            </div>
            <div>
              <div className="text-xs text-gray-400">Your BaseGold</div>
              <div className="text-xl font-bold text-[#D4AF37] font-mono">
                {isConnected && bgBalance 
                  ? parseFloat(bgBalance.formatted).toFixed(4) 
                  : '0.0000'} 
                <span className="text-sm text-gray-500 ml-1">BG</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('buy')}
            className="px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#996515] text-black font-bold text-sm rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/30 transition-all"
          >
            {isConnected && bgBalance && parseFloat(bgBalance.formatted) > 0 ? '+ Buy More' : '🛒 Buy BG'}
          </button>
        </div>
        {isConnected && bgBalance && parseFloat(bgBalance.formatted) > 0 && (
          <div className="max-w-lg mx-auto mt-2">
            <div className="text-xs text-center text-[#D4AF37]/70">
              ✨ Watch your BG grow in value as others burn! Every burn = more scarcity
            </div>
          </div>
        )}
      </div>

      {/* Your USDC Balance Display - For Shop Purchases */}
      <div className="bg-gradient-to-r from-[#2775CA]/10 via-[#1a5490]/10 to-[#2775CA]/10 border-b border-[#2775CA]/30 py-2 px-4">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#2775CA] flex items-center justify-center text-white font-bold text-xs">
              $
            </div>
            <div>
              <div className="text-xs text-gray-400">Your USDC</div>
              <div className="text-lg font-bold text-[#2775CA] font-mono">
                ${isConnected && usdcBalance 
                  ? parseFloat(usdcBalance.formatted).toFixed(2) 
                  : '0.00'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && usdcBalance && parseFloat(usdcBalance.formatted) < 1 && (
              <span className="text-xs text-orange-400">Low balance</span>
            )}
            <a
              href="https://www.coinbase.com/how-to-buy/usdc"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-[#2775CA]/20 border border-[#2775CA]/50 text-[#2775CA] font-medium text-xs rounded-lg hover:bg-[#2775CA]/30 transition-all"
            >
              {isConnected && usdcBalance && parseFloat(usdcBalance.formatted) > 0 ? '+ Get More' : 'Get USDC'}
            </a>
          </div>
        </div>
        <div className="max-w-lg mx-auto mt-1">
          <div className="text-xs text-center text-gray-500">
            💎 Use USDC to buy shop items → Burns BG → Your BG becomes more valuable!
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-white/10 overflow-x-auto">
        {[
          { id: 'game', label: '⛏️ Mine' },
          { id: 'shop', label: '💎 Shop' },
          { id: 'buy', label: '🛒 Buy BG' },
          { id: 'achievements', label: '🎖️ Awards' },
          { id: 'leaderboard', label: '🏆 Top' },
          { id: 'stats', label: '📊 Stats' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-3 text-xs font-medium transition-all whitespace-nowrap px-1
              ${activeTab === tab.id 
                ? 'text-[#D4AF37] border-b-2 border-[#D4AF37] bg-[#D4AF37]/5' 
                : 'text-gray-500 hover:text-gray-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto p-4">
        {/* ============ GAME TAB ============ */}
        {activeTab === 'game' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 mb-4 p-3 bg-black/50 rounded-xl border border-white/10">
              <div className="text-center">
                <div className="text-lg font-bold text-[#D4AF37]">{formatNumber(gold)}</div>
                <div className="text-[10px] text-gray-500">GOLD</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-[#D4AF37]">{goldPerClick * clickMultiplier}</div>
                <div className="text-[10px] text-gray-500">PER CLICK</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-[#D4AF37]">{formatNumber(goldPerSecond)}</div>
                <div className="text-[10px] text-gray-500">PER SEC</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-[#D4AF37]">x{combo}</div>
                <div className="text-[10px] text-gray-500">COMBO</div>
              </div>
            </div>

            {/* Boost */}
            {boostEndTime && (
              <div className="mb-4 p-2 bg-[#D4AF37]/20 border border-[#D4AF37] rounded-lg text-center animate-pulse">
                <span className="text-[#D4AF37]">⚡ {clickMultiplier}x BOOST ACTIVE</span>
              </div>
            )}

            {/* Gold Coin */}
            <div className="relative flex justify-center items-center h-56 mb-4">
              {floatingTexts.map(ft => (
                <div
                  key={ft.id}
                  className="absolute pointer-events-none font-bold text-[#D4AF37] text-xl"
                  style={{ 
                    left: ft.x, 
                    top: ft.y,
                    animation: 'floatUp 1s ease-out forwards'
                  }}
                >
                  {ft.text}
                </div>
              ))}
              <button
                onClick={handleClick}
                className="w-44 h-44 rounded-full select-none
                  bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515]
                  border-8 border-[#996515]
                  shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_50px_rgba(212,175,55,0.3)]
                  hover:shadow-[0_0_80px_rgba(212,175,55,0.5)]
                  active:scale-95 transition-all duration-100
                  flex items-center justify-center
                  text-4xl font-bold text-[#996515]"
              >
                BG
              </button>
            </div>

            {/* Upgrades */}
            <h3 className="text-[#D4AF37] mb-2">⚡ Upgrades</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(upgrades).map(([key, upgrade]) => (
                <button
                  key={key}
                  onClick={() => buyUpgrade(key as keyof typeof upgrades)}
                  disabled={gold < upgrade.cost}
                  className={`p-2 rounded-lg border transition-all text-left text-sm
                    ${gold >= upgrade.cost 
                      ? 'bg-[#D4AF37]/10 border-[#D4AF37]/50 hover:bg-[#D4AF37]/20' 
                      : 'bg-white/5 border-white/10 opacity-50'}`}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span>{upgrade.emoji}</span>
                    <span className="text-xs font-medium">{upgrade.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#D4AF37] text-xs">{formatNumber(upgrade.cost)}</span>
                    <span className="text-gray-500 text-xs">x{upgrade.owned}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ============ SHOP TAB ============ */}
        {activeTab === 'shop' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">💎 Premium Shop</h2>
              <p className="text-xs text-orange-400">Every purchase instantly burns BG! 🔥</p>
            </div>

            {isConnected && usdcBalance && (
              <div className="mb-4 p-3 bg-[#2775CA]/10 border border-[#2775CA]/30 rounded-lg">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#2775CA] flex items-center justify-center text-white font-bold text-xs">$</div>
                    <span className="text-gray-300 text-sm">Your USDC:</span>
                  </div>
                  <span className="text-[#2775CA] font-bold text-lg">${parseFloat(usdcBalance.formatted).toFixed(2)}</span>
                </div>
                {parseFloat(usdcBalance.formatted) < 5 && (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-orange-400">⚠️ Low balance for shopping</span>
                    <button
                      onClick={() => setActiveTab('buy')}
                      className="text-xs text-[#2775CA] hover:underline"
                    >
                      Get USDC →
                    </button>
                  </div>
                )}
              </div>
            )}

            {isConnected && !usdcBalance && (
              <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-orange-400">💵 You need USDC to buy items</span>
                  <button
                    onClick={() => setActiveTab('buy')}
                    className="px-3 py-1 bg-[#2775CA] text-white text-xs font-medium rounded hover:bg-[#2775CA]/80"
                  >
                    Get USDC
                  </button>
                </div>
              </div>
            )}

            {purchaseSuccess && (
              <div className="mb-4 p-3 bg-green-500/20 border border-green-500 rounded-lg text-center">
                <span className="text-green-400">✓ Purchase complete! BG burned instantly! 🔥</span>
              </div>
            )}

            <div className="space-y-2">
              {SHOP_ITEMS.map(item => (
                <div key={item.id}>
                  <button
                    onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                    className={`w-full p-3 rounded-xl border transition-all text-left
                      ${selectedItem?.id === item.id 
                        ? 'bg-[#2775CA]/20 border-[#2775CA]' 
                        : 'bg-white/5 border-white/10 hover:border-[#D4AF37]/50'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{item.emoji}</span>
                        <div>
                          <div className="font-medium text-sm">{item.name}</div>
                          <div className="text-xs text-gray-400">{item.description}</div>
                        </div>
                      </div>
                      <div className="text-[#2775CA] font-bold">${item.priceUSDC}</div>
                    </div>
                  </button>
                  
                  {selectedItem?.id === item.id && isConnected && (
                    <div className="mt-2 p-2 bg-black/50 rounded-lg">
                      <Transaction
                        chainId={base.id}
                        calls={buildPurchaseCalls(item.priceUSDC, item.id)}
                        onSuccess={() => applyPurchaseEffect(item)}
                      >
                        <TransactionButton 
                          text={`Pay $${item.priceUSDC} & Burn BG 🔥`}
                          className="w-full py-2 rounded-lg font-bold bg-gradient-to-r from-orange-500 to-red-500 text-sm"
                        />
                        <TransactionStatus>
                          <TransactionStatusLabel />
                          <TransactionStatusAction />
                        </TransactionStatus>
                      </Transaction>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!isConnected && (
              <div className="mt-4 text-center">
                <p className="text-gray-400 text-sm mb-2">Connect wallet to purchase</p>
                <Wallet><ConnectWallet /></Wallet>
              </div>
            )}
          </>
        )}

        {/* ============ BUY BG TAB ============ */}
        {activeTab === 'buy' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">🛒 Buy BaseGold</h2>
              <p className="text-xs text-gray-400">Get BG and watch it grow as others burn!</p>
            </div>

            {/* Current Holdings */}
            <div className="mb-4 p-4 bg-gradient-to-br from-[#D4AF37]/20 to-[#996515]/20 border border-[#D4AF37]/30 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] flex items-center justify-center text-[#996515] font-bold border-2 border-[#996515]">
                    BG
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Your Balance</div>
                    <div className="text-2xl font-bold text-[#D4AF37] font-mono">
                      {isConnected && bgBalance ? parseFloat(bgBalance.formatted).toFixed(4) : '0.0000'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Scarcity</div>
                  <div className="text-lg font-bold text-green-400">
                    {Math.round(21000000 / (INITIAL_SUPPLY - totalBurned)).toLocaleString()}x
                  </div>
                  <div className="text-xs text-gray-500">vs Bitcoin</div>
                </div>
              </div>
            </div>

            {/* Why Buy BG */}
            <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-lg">🔥</span>
                <div className="text-xs text-orange-200">
                  <strong>Deflationary by design:</strong> Every shop purchase burns BG forever, 
                  making your holdings more scarce. Only {(INITIAL_SUPPLY - totalBurned).toFixed(2)} BG remain!
                </div>
              </div>
            </div>

            {/* DEX Options */}
            <h3 className="text-sm font-medium text-gray-300 mb-3">Choose an Exchange:</h3>
            
            <div className="space-y-2">
              {/* Aerodrome - Primary */}
              <a
                href="https://aerodrome.finance/swap?from=eth&to=0x36b712A629095234F2196BbB000D1b96C12Ce78e"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-xl">
                      🔵
                    </div>
                    <div>
                      <div className="font-medium text-white">Aerodrome</div>
                      <div className="text-xs text-gray-400">Recommended • Best liquidity</div>
                    </div>
                  </div>
                  <div className="text-blue-400 text-sm">Swap →</div>
                </div>
              </a>

              {/* Uniswap */}
              <a
                href="https://app.uniswap.org/swap?outputCurrency=0x36b712A629095234F2196BbB000D1b96C12Ce78e&chain=base"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl hover:bg-pink-500/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center text-xl">
                      🦄
                    </div>
                    <div>
                      <div className="font-medium text-white">Uniswap</div>
                      <div className="text-xs text-gray-400">Popular DEX</div>
                    </div>
                  </div>
                  <div className="text-pink-400 text-sm">Swap →</div>
                </div>
              </a>

              {/* SushiSwap */}
              <a
                href="https://www.sushi.com/swap?chainId=8453&token1=0x36b712A629095234F2196BbB000D1b96C12Ce78e"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl hover:bg-purple-500/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-xl">
                      🍣
                    </div>
                    <div>
                      <div className="font-medium text-white">SushiSwap</div>
                      <div className="text-xs text-gray-400">Multi-chain DEX</div>
                    </div>
                  </div>
                  <div className="text-purple-400 text-sm">Swap →</div>
                </div>
              </a>

              {/* PancakeSwap */}
              <a
                href="https://pancakeswap.finance/swap?outputCurrency=0x36b712A629095234F2196BbB000D1b96C12Ce78e&chain=base"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl hover:bg-yellow-500/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-xl">
                      🥞
                    </div>
                    <div>
                      <div className="font-medium text-white">PancakeSwap</div>
                      <div className="text-xs text-gray-400">Low fees</div>
                    </div>
                  </div>
                  <div className="text-yellow-400 text-sm">Swap →</div>
                </div>
              </a>

              {/* Matcha / 0x */}
              <a
                href="https://matcha.xyz/tokens/base/0x36b712a629095234f2196bbb000d1b96c12ce78e"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-green-500/10 border border-green-500/30 rounded-xl hover:bg-green-500/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-xl">
                      🍵
                    </div>
                    <div>
                      <div className="font-medium text-white">Matcha</div>
                      <div className="text-xs text-gray-400">DEX Aggregator • Best rates</div>
                    </div>
                  </div>
                  <div className="text-green-400 text-sm">Swap →</div>
                </div>
              </a>

              {/* DexScreener */}
              <a
                href="https://dexscreener.com/base/0x36b712A629095234F2196BbB000D1b96C12Ce78e"
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-gray-500/10 border border-gray-500/30 rounded-xl hover:bg-gray-500/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-500/20 flex items-center justify-center text-xl">
                      📊
                    </div>
                    <div>
                      <div className="font-medium text-white">DexScreener</div>
                      <div className="text-xs text-gray-400">View chart & all pools</div>
                    </div>
                  </div>
                  <div className="text-gray-400 text-sm">View →</div>
                </div>
              </a>
            </div>

            {/* Contract Address */}
            <div className="mt-4 p-3 bg-white/5 rounded-lg">
              <div className="text-xs text-gray-400 mb-1">BG Contract Address (Base):</div>
              <div className="flex items-center gap-2">
                <code className="text-xs text-[#D4AF37] font-mono flex-1 truncate">
                  0x36b712A629095234F2196BbB000D1b96C12Ce78e
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText('0x36b712A629095234F2196BbB000D1b96C12Ce78e');
                    alert('Copied!');
                  }}
                  className="px-2 py-1 bg-white/10 rounded text-xs hover:bg-white/20"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Get USDC Section */}
            <div className="mt-4 p-4 bg-[#2775CA]/10 border border-[#2775CA]/30 rounded-xl">
              <h3 className="text-sm font-medium text-[#2775CA] mb-2">💵 Need USDC for Shop?</h3>
              <p className="text-xs text-gray-400 mb-3">
                USDC is required to buy premium items. Get USDC on Base:
              </p>
              <div className="space-y-2">
                <a
                  href="https://www.coinbase.com/how-to-buy/usdc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-[#0052FF]/20 border border-[#0052FF]/30 rounded-lg hover:bg-[#0052FF]/30 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔵</span>
                    <div>
                      <div className="text-sm font-medium text-white">Coinbase</div>
                      <div className="text-xs text-gray-400">Buy with card/bank</div>
                    </div>
                  </div>
                  <span className="text-[#0052FF] text-xs">Get USDC →</span>
                </a>
                <a
                  href="https://aerodrome.finance/swap?from=eth&to=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔄</span>
                    <div>
                      <div className="text-sm font-medium text-white">Swap ETH → USDC</div>
                      <div className="text-xs text-gray-400">On Aerodrome</div>
                    </div>
                  </div>
                  <span className="text-blue-400 text-xs">Swap →</span>
                </a>
                <a
                  href="https://bridge.base.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🌉</span>
                    <div>
                      <div className="text-sm font-medium text-white">Bridge to Base</div>
                      <div className="text-xs text-gray-400">From Ethereum/other chains</div>
                    </div>
                  </div>
                  <span className="text-gray-400 text-xs">Bridge →</span>
                </a>
              </div>
            </div>

            {!isConnected && (
              <div className="mt-4 text-center">
                <p className="text-gray-400 text-sm mb-2">Connect wallet to see your balance</p>
                <Wallet><ConnectWallet /></Wallet>
              </div>
            )}
          </>
        )}

        {/* ============ ACHIEVEMENTS TAB ============ */}
        {activeTab === 'achievements' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">🎖️ Achievements</h2>
              <p className="text-xs text-gray-400">Unlock rewards for your progress</p>
            </div>

            {/* Achievement Score */}
            <div className="mb-4 p-4 bg-gradient-to-r from-[#D4AF37]/20 to-[#996515]/20 border border-[#D4AF37]/30 rounded-xl">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs text-gray-400">Achievement Score</div>
                  <div className="text-2xl font-bold text-[#D4AF37]">{achievementScore.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Progress</div>
                  <div className="text-lg font-bold text-white">
                    {unlockedAchievements.size} / {ACHIEVEMENTS.length}
                  </div>
                </div>
              </div>
              <div className="mt-2 h-2 bg-black/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[#D4AF37] to-[#F4E4BA] transition-all"
                  style={{ width: `${(achievementScore / maxAchievementScore) * 100}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 text-right mt-1">
                {achievementScore} / {maxAchievementScore} points
              </div>
            </div>

            {/* Your Burn Stats */}
            {isConnected && (
              <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Your Burns:</span>
                  <span className="text-orange-400 font-bold">{userBurnCount} burns ({userBurnAmount.toFixed(6)} BG)</span>
                </div>
              </div>
            )}

            {/* Category Filter */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
              {[
                { id: 'all', label: 'All' },
                { id: 'mining', label: '⛏️ Mining' },
                { id: 'burning', label: '🔥 Burning' },
                { id: 'shopping', label: '🛒 Shopping' },
                { id: 'mastery', label: '🌟 Mastery' },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setAchievementCategory(cat.id as any)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all
                    ${achievementCategory === cat.id 
                      ? 'bg-[#D4AF37] text-black' 
                      : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Achievements List */}
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {ACHIEVEMENTS
                .filter(a => achievementCategory === 'all' || a.category === achievementCategory)
                .sort((a, b) => {
                  const aUnlocked = unlockedAchievements.has(a.id);
                  const bUnlocked = unlockedAchievements.has(b.id);
                  if (aUnlocked !== bUnlocked) return bUnlocked ? 1 : -1;
                  const tierOrder = ['bronze', 'silver', 'gold', 'diamond', 'legendary'];
                  return tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier);
                })
                .map(achievement => {
                  const isUnlocked = unlockedAchievements.has(achievement.id);
                  
                  let progress = 0;
                  let progressMax = achievement.requirement.value;
                  let progressText = '';
                  
                  if (!isUnlocked) {
                    switch (achievement.requirement.type) {
                      case 'clicks':
                        progress = totalClicks;
                        progressText = `${totalClicks.toLocaleString()} / ${progressMax.toLocaleString()} clicks`;
                        break;
                      case 'gold':
                        progress = gold;
                        progressText = `${formatNumber(gold)} / ${formatNumber(progressMax)} gold`;
                        break;
                      case 'goldPerSec':
                        progress = goldPerSecond;
                        progressText = `${goldPerSecond} / ${progressMax} gold/sec`;
                        break;
                      case 'combo':
                        progress = highestCombo;
                        progressText = `${highestCombo}x / ${progressMax}x combo`;
                        break;
                      case 'upgrades':
                        progress = totalUpgradesOwned;
                        progressText = `${totalUpgradesOwned} / ${progressMax} upgrades`;
                        break;
                      case 'burns':
                        progress = userBurnCount;
                        progressText = `${userBurnCount} / ${progressMax} burns`;
                        break;
                      case 'burnAmount':
                        progress = userBurnAmount;
                        progressText = `${userBurnAmount.toFixed(6)} / ${progressMax} BG`;
                        break;
                      case 'purchases':
                        progress = totalPurchases;
                        progressText = `${totalPurchases} / ${progressMax} purchases`;
                        break;
                    }
                  }
                  
                  const progressPercent = Math.min((progress / progressMax) * 100, 100);
                  const isMasteryAchievement = ['achievement_hunter', 'completionist', 'true_master'].includes(achievement.id);
                  
                  return (
                    <div 
                      key={achievement.id}
                      className={`p-3 rounded-xl border transition-all
                        ${isUnlocked 
                          ? `bg-gradient-to-r ${TIER_COLORS[achievement.tier]} border-transparent` 
                          : 'bg-white/5 border-white/10 opacity-70'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`text-2xl ${!isUnlocked && 'grayscale opacity-50'}`}>
                          {achievement.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium text-sm ${isUnlocked ? 'text-white' : 'text-gray-300'}`}>
                              {achievement.name}
                            </span>
                            {isUnlocked && <span className="text-xs">✓</span>}
                          </div>
                          <div className={`text-xs ${isUnlocked ? 'text-white/80' : 'text-gray-500'}`}>
                            {achievement.description}
                          </div>
                          
                          {!isUnlocked && !isMasteryAchievement && (
                            <div className="mt-2">
                              <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full bg-gradient-to-r ${TIER_COLORS[achievement.tier]} transition-all`}
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-gray-500 mt-0.5">{progressText}</div>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className={`text-xs font-bold ${isUnlocked ? 'text-white' : 'text-gray-500'}`}>
                            +{achievement.points}
                          </div>
                          <div className={`text-[10px] capitalize ${isUnlocked ? 'text-white/60' : 'text-gray-600'}`}>
                            {achievement.tier}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            
            {!isConnected && (
              <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg text-center">
                <p className="text-orange-400 text-sm mb-2">🔥 Connect wallet to track burn achievements!</p>
                <Wallet><ConnectWallet /></Wallet>
              </div>
            )}
          </>
        )}

        {/* ============ LEADERBOARD TAB ============ */}
        {activeTab === 'leaderboard' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">🏆 Leaderboards</h2>
              <p className="text-xs text-gray-400">Top miners and burners</p>
            </div>

            {/* Leaderboard Type Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setLeaderboardTab('burns')}
                className={`flex-1 py-2 rounded-lg font-medium transition-all text-sm
                  ${leaderboardTab === 'burns' 
                    ? 'bg-orange-500/20 border border-orange-500 text-orange-400' 
                    : 'bg-white/5 border border-white/10 text-gray-400'}`}
              >
                🔥 Top Burners
              </button>
              <button
                onClick={() => setLeaderboardTab('points')}
                className={`flex-1 py-2 rounded-lg font-medium transition-all text-sm
                  ${leaderboardTab === 'points' 
                    ? 'bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37]' 
                    : 'bg-white/5 border border-white/10 text-gray-400'}`}
              >
                ⛏️ Top Miners
              </button>
            </div>

            {/* Burn Leaderboard */}
            {leaderboardTab === 'burns' && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500 px-3 mb-2">
                  <span>RANK / ADDRESS</span>
                  <span>BG BURNED</span>
                </div>
                
                {loadingLeaderboard ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="animate-spin text-2xl mb-2">🔥</div>
                    Loading burns from blockchain...
                  </div>
                ) : burnLeaderboard.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-4xl mb-2">🔥</div>
                    <p>No burns yet!</p>
                    <p className="text-xs mt-1">Be the first to burn BG</p>
                  </div>
                ) : (
                  burnLeaderboard.map((entry, index) => (
                    <div 
                      key={entry.address}
                      className={`flex justify-between items-center p-3 rounded-lg border
                        ${entry.address.toLowerCase() === address?.toLowerCase()
                          ? 'bg-orange-500/20 border-orange-500'
                          : 'bg-white/5 border-white/10'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold w-8
                          ${index === 0 ? 'text-yellow-400' : 
                            index === 1 ? 'text-gray-300' : 
                            index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        <div>
                          <div className="font-mono text-sm">
                            {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {entry.burnCount} burn{entry.burnCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-orange-400 font-bold">
                          {entry.totalBurned.toFixed(6)}
                        </div>
                        <div className="text-xs text-gray-500">BG</div>
                      </div>
                    </div>
                  ))
                )}

                <button
                  onClick={fetchBurnLeaderboard}
                  className="w-full mt-4 py-2 text-sm text-gray-400 hover:text-white bg-white/5 rounded-lg"
                >
                  🔄 Refresh
                </button>

                <p className="text-xs text-center text-gray-500 mt-2">
                  📡 Live data from Base blockchain
                </p>
              </div>
            )}

            {/* Points Leaderboard */}
            {leaderboardTab === 'points' && (
              <div className="space-y-2">
                {/* Submit Score Section */}
                {isConnected && (
                  <div className="mb-4 p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-300">Your Score:</span>
                      <span className="text-[#D4AF37] font-bold">{formatNumber(gold)} gold</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value.slice(0, 20))}
                        placeholder="Your name (optional)"
                        className="flex-1 bg-black/50 border border-white/20 rounded px-2 py-1 text-sm
                          focus:border-[#D4AF37] focus:outline-none"
                        maxLength={20}
                      />
                      <button
                        onClick={submitScore}
                        disabled={gold < 100}
                        className={`px-4 py-1 rounded font-medium text-sm
                          ${gold >= 100 
                            ? 'bg-[#D4AF37] text-black hover:bg-[#E5C048]' 
                            : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                      >
                        Submit
                      </button>
                    </div>
                    {gold < 100 && (
                      <p className="text-xs text-gray-500 mt-1">Need at least 100 gold to submit</p>
                    )}
                  </div>
                )}

                <div className="flex justify-between text-xs text-gray-500 px-3 mb-2">
                  <span>RANK / MINER</span>
                  <span>GOLD</span>
                </div>
                
                {pointsLeaderboard.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-4xl mb-2">⛏️</div>
                    <p>No scores yet!</p>
                    <p className="text-xs mt-1">Start mining and submit your score</p>
                  </div>
                ) : (
                  pointsLeaderboard.map((entry, index) => (
                    <div 
                      key={entry.address}
                      className={`flex justify-between items-center p-3 rounded-lg border
                        ${entry.address.toLowerCase() === address?.toLowerCase()
                          ? 'bg-[#D4AF37]/20 border-[#D4AF37]'
                          : 'bg-white/5 border-white/10'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold w-8
                          ${index === 0 ? 'text-yellow-400' : 
                            index === 1 ? 'text-gray-300' : 
                            index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        <div>
                          <div className="font-medium text-sm">
                            {entry.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {entry.totalClicks.toLocaleString()} clicks
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[#D4AF37] font-bold">
                          {formatNumber(entry.gold)}
                        </div>
                        <div className="text-xs text-gray-500">gold</div>
                      </div>
                    </div>
                  ))
                )}

                <button
                  onClick={loadPointsLeaderboard}
                  className="w-full mt-4 py-2 text-sm text-gray-400 hover:text-white bg-white/5 rounded-lg"
                >
                  🔄 Refresh
                </button>

                {!isConnected && (
                  <div className="mt-4 text-center">
                    <p className="text-gray-400 text-sm mb-2">Connect wallet to submit score</p>
                    <Wallet><ConnectWallet /></Wallet>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ============ STATS TAB ============ */}
        {activeTab === 'stats' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">📊 Burn Stats</h2>
              <p className="text-xs text-gray-400">Real-time deflationary metrics</p>
            </div>

            {/* Big Burn Counter */}
            <div className="mb-6 p-6 bg-gradient-to-br from-orange-900/30 to-red-900/30 border border-orange-500/30 rounded-2xl text-center">
              <div className="text-5xl mb-2">🔥</div>
              <div className="text-3xl font-bold text-orange-400 font-mono">
                {totalBurned.toFixed(4)}
              </div>
              <div className="text-gray-400">BG Burned Forever</div>
              {lastBurnAmount && (
                <div className="mt-2 text-sm text-green-400 animate-pulse">
                  Last burn: +{parseFloat(lastBurnAmount).toFixed(6)} BG
                </div>
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-[#D4AF37]">
                  {(INITIAL_SUPPLY - totalBurned).toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">Circulating Supply</div>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-orange-400">
                  {((totalBurned / INITIAL_SUPPLY) * 100).toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500">Total Burned</div>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-green-400">
                  {Math.round(21000000 / (INITIAL_SUPPLY - totalBurned)).toLocaleString()}x
                </div>
                <div className="text-xs text-gray-500">vs Bitcoin Scarcity</div>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {totalBurnCount}
                </div>
                <div className="text-xs text-gray-500">Mini App Burns</div>
              </div>
            </div>

            {/* Mini App Contribution */}
            <div className="bg-white/5 p-4 rounded-xl">
              <h3 className="text-sm font-medium text-gray-300 mb-3">🎮 Mini App Burn Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">USDC Spent:</span>
                  <span className="text-[#2775CA]">${lifetimeUsdcBurned.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">BG Burned:</span>
                  <span className="text-orange-400">{lifetimeBgBurned.toFixed(6)} BG</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Purchases:</span>
                  <span className="text-white">{totalBurnCount}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-center text-gray-500 mt-4">
              Data updates live from Base blockchain
            </p>
          </>
        )}
      </main>

      <style jsx global>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-50px); }
        }
      `}</style>
    </div>
  );
}
