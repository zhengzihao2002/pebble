import {
  Home, UtensilsCrossed, Car, ShoppingBag, Zap, Film, HeartPulse, CreditCard,
  GraduationCap, Plane, Gift, PiggyBank, Shield, PawPrint, Sparkles, Laptop, Key,
  Shapes, Coffee, Bus, Dumbbell, Music, Book, Wrench, Baby, Stethoscope,
  Smartphone, Wifi, Fuel, Shirt, Wine, Ticket, Hammer, Briefcase, Landmark,
  // Larger category icon palette - grouped the same way as the list below.
  Pizza, Sandwich, Salad, Apple, Cake, IceCreamCone, CupSoda, Beer, ChefHat, ShoppingCart, Store,
  TrainFront, Bike, Ship, CarTaxiFront,
  Sofa, Bed, Bath, Lightbulb, Flame, Droplet, Plug, Building2,
  Pill, Syringe, Glasses, Hospital,
  Scissors, Gem, Watch, Package, Truck,
  Gamepad2, Tv, Headphones, Camera, Palette, Popcorn, Dice5,
  BookOpen, School, Calculator,
  Dog, Cat, Users, HandHeart, Heart,
  Wallet, Banknote, Coins, Receipt, Percent, TrendingUp, HandCoins,
  Hotel, Luggage, MapPin, Tent, Mountain, Umbrella,
  Phone, Mail, Cloud, Leaf, Sprout, Flower2, TreePine, Recycle, Globe, Star,
} from 'lucide-react';
import type { GoalIconOption } from '@/types';

// Icon palette for user-created categories. Every icon used by the seeded
// defaults appears here, so a seeded category can always be re-picked from
// the same list it was created from.
//
// The `key` string is what the database stores in category.icon_key - never
// the component itself, which cannot cross the server/client boundary.
export const CATEGORY_ICON_OPTIONS: GoalIconOption[] = [
  { key: 'Shapes', icon: Shapes },
  { key: 'Home', icon: Home },
  { key: 'UtensilsCrossed', icon: UtensilsCrossed },
  { key: 'Car', icon: Car },
  { key: 'ShoppingBag', icon: ShoppingBag },
  { key: 'Zap', icon: Zap },
  { key: 'Film', icon: Film },
  { key: 'HeartPulse', icon: HeartPulse },
  { key: 'CreditCard', icon: CreditCard },
  { key: 'GraduationCap', icon: GraduationCap },
  { key: 'Plane', icon: Plane },
  { key: 'Gift', icon: Gift },
  { key: 'PiggyBank', icon: PiggyBank },
  { key: 'Shield', icon: Shield },
  { key: 'PawPrint', icon: PawPrint },
  { key: 'Sparkles', icon: Sparkles },
  { key: 'Coffee', icon: Coffee },
  { key: 'Bus', icon: Bus },
  { key: 'Dumbbell', icon: Dumbbell },
  { key: 'Music', icon: Music },
  { key: 'Book', icon: Book },
  { key: 'Wrench', icon: Wrench },
  { key: 'Baby', icon: Baby },
  { key: 'Stethoscope', icon: Stethoscope },
  { key: 'Smartphone', icon: Smartphone },
  { key: 'Wifi', icon: Wifi },
  { key: 'Fuel', icon: Fuel },
  { key: 'Shirt', icon: Shirt },
  { key: 'Wine', icon: Wine },
  { key: 'Ticket', icon: Ticket },
  { key: 'Hammer', icon: Hammer },
  { key: 'Briefcase', icon: Briefcase },
  { key: 'Landmark', icon: Landmark },
  { key: 'Laptop', icon: Laptop },
  { key: 'Key', icon: Key },
  // Food and drink
  { key: 'Pizza', icon: Pizza },
  { key: 'Sandwich', icon: Sandwich },
  { key: 'Salad', icon: Salad },
  { key: 'Apple', icon: Apple },
  { key: 'Cake', icon: Cake },
  { key: 'IceCreamCone', icon: IceCreamCone },
  { key: 'CupSoda', icon: CupSoda },
  { key: 'Beer', icon: Beer },
  { key: 'ChefHat', icon: ChefHat },
  { key: 'ShoppingCart', icon: ShoppingCart },
  { key: 'Store', icon: Store },
  // Transport
  { key: 'TrainFront', icon: TrainFront },
  { key: 'Bike', icon: Bike },
  { key: 'Ship', icon: Ship },
  { key: 'CarTaxiFront', icon: CarTaxiFront },
  // Home and utilities
  { key: 'Sofa', icon: Sofa },
  { key: 'Bed', icon: Bed },
  { key: 'Bath', icon: Bath },
  { key: 'Lightbulb', icon: Lightbulb },
  { key: 'Flame', icon: Flame },
  { key: 'Droplet', icon: Droplet },
  { key: 'Plug', icon: Plug },
  { key: 'Building2', icon: Building2 },
  // Health
  { key: 'Pill', icon: Pill },
  { key: 'Syringe', icon: Syringe },
  { key: 'Glasses', icon: Glasses },
  { key: 'Hospital', icon: Hospital },
  // Shopping and personal
  { key: 'Scissors', icon: Scissors },
  { key: 'Gem', icon: Gem },
  { key: 'Watch', icon: Watch },
  { key: 'Package', icon: Package },
  { key: 'Truck', icon: Truck },
  // Entertainment
  { key: 'Gamepad2', icon: Gamepad2 },
  { key: 'Tv', icon: Tv },
  { key: 'Headphones', icon: Headphones },
  { key: 'Camera', icon: Camera },
  { key: 'Palette', icon: Palette },
  { key: 'Popcorn', icon: Popcorn },
  { key: 'Dice5', icon: Dice5 },
  // Work and education
  { key: 'BookOpen', icon: BookOpen },
  { key: 'School', icon: School },
  { key: 'Calculator', icon: Calculator },
  // Family and pets
  { key: 'Dog', icon: Dog },
  { key: 'Cat', icon: Cat },
  { key: 'Users', icon: Users },
  { key: 'HandHeart', icon: HandHeart },
  { key: 'Heart', icon: Heart },
  // Money
  { key: 'Wallet', icon: Wallet },
  { key: 'Banknote', icon: Banknote },
  { key: 'Coins', icon: Coins },
  { key: 'Receipt', icon: Receipt },
  { key: 'Percent', icon: Percent },
  { key: 'TrendingUp', icon: TrendingUp },
  { key: 'HandCoins', icon: HandCoins },
  // Travel
  { key: 'Hotel', icon: Hotel },
  { key: 'Luggage', icon: Luggage },
  { key: 'MapPin', icon: MapPin },
  { key: 'Tent', icon: Tent },
  { key: 'Mountain', icon: Mountain },
  { key: 'Umbrella', icon: Umbrella },
  // Other
  { key: 'Phone', icon: Phone },
  { key: 'Mail', icon: Mail },
  { key: 'Cloud', icon: Cloud },
  { key: 'Leaf', icon: Leaf },
  { key: 'Sprout', icon: Sprout },
  { key: 'Flower2', icon: Flower2 },
  { key: 'TreePine', icon: TreePine },
  { key: 'Recycle', icon: Recycle },
  { key: 'Globe', icon: Globe },
  { key: 'Star', icon: Star },
];

export const CATEGORY_COLOR_OPTIONS = [
  '#1F5A45', '#AD7B2E', '#5B7B9A', '#8C3D42', '#B0A23E',
  '#7A6BA6', '#4C8577', '#9C7A54',
];

// Categories created for a brand-new account. Mirrors the original hardcoded
// initialCategoryMeta taxonomy so existing behaviour is preserved, plus the
// undeletable fallback. Users can rename, recolour, add and delete from here.
//
// Icon keys, not components - these are written to the database.
export const DEFAULT_CATEGORY_SEED: { name: string; iconKey: string; color: string }[] = [
  { name: 'Housing',           iconKey: 'Home',            color: '#1F5A45' },
  { name: 'Food & Dining',     iconKey: 'UtensilsCrossed', color: '#AD7B2E' },
  { name: 'Transportation',    iconKey: 'Car',             color: '#5B7B9A' },
  { name: 'Shopping',          iconKey: 'ShoppingBag',     color: '#8C3D42' },
  { name: 'Utilities',         iconKey: 'Zap',             color: '#B0A23E' },
  { name: 'Entertainment',     iconKey: 'Film',            color: '#7A6BA6' },
  { name: 'Health & Fitness',  iconKey: 'HeartPulse',      color: '#4C8577' },
  { name: 'Subscriptions',     iconKey: 'CreditCard',      color: '#9C7A54' },
  { name: 'Education',         iconKey: 'GraduationCap',   color: '#5B7B9A' },
  { name: 'Travel',            iconKey: 'Plane',           color: '#AD7B2E' },
  { name: 'Gifts & Donations', iconKey: 'Gift',            color: '#7A6BA6' },
  { name: 'Savings',           iconKey: 'PiggyBank',       color: '#1F5A45' },
  { name: 'Insurance',         iconKey: 'Shield',          color: '#4C8577' },
  { name: 'Pets',              iconKey: 'PawPrint',        color: '#9C7A54' },
  { name: 'Personal Care',     iconKey: 'Sparkles',        color: '#8C3D42' },
];

// The undeletable fallback category. Every account gets exactly one, and
// deleting any other category reassigns its transactions here by default.
export const FALLBACK_CATEGORY_NAME = 'Miscellaneous';
export const FALLBACK_CATEGORY_ICON_KEY = 'Shapes';
export const FALLBACK_CATEGORY_COLOR = '#5B7B9A';

export const GOAL_ICON_OPTIONS: GoalIconOption[] = [
  { key: 'Shield', icon: Shield }, { key: 'Plane', icon: Plane }, { key: 'Laptop', icon: Laptop },
  { key: 'Key', icon: Key }, { key: 'Home', icon: Home }, { key: 'Car', icon: Car },
  { key: 'GraduationCap', icon: GraduationCap }, { key: 'Gift', icon: Gift },
];
export const GOAL_COLOR_OPTIONS = ['#1F5A45', '#AD7B2E', '#5B7B9A', '#4C8577', '#7A6BA6', '#B0A23E'];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const QUARTER_NAMES = ['Q1', 'Q2', 'Q3', 'Q4'];

export const TREND_MODES = [
  { value: 'last6', label: 'Last 6 months' },
  { value: 'last12', label: 'Last 12 months' },
  { value: 'month', label: 'By month' },
  { value: 'quarter', label: 'By quarter' },
  { value: 'year', label: 'By year' },
];

export const STATS_MODES = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'last6', label: 'Last 6 months' },
  { value: 'last12', label: 'Last 12 months' },
  { value: 'month', label: 'By month' },
  { value: 'quarter', label: 'By quarter' },
  { value: 'year', label: 'By year' },
];
