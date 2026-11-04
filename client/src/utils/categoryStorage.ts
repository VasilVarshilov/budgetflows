import { ExpenseCategory, CategoriesStore } from "@/types";
import {
  Droplets,
  Zap,
  Fuel,
  Car,
  Utensils,
  UtensilsCrossed,
  Scissors,
  Film,
  Pill,
  PawPrint,
  Sparkles,
  Shirt,
  Heart,
  Gift,
  GraduationCap,
  Bus,
  CarTaxiFront,
  ShoppingBag,
  CircleHelp,
  CreditCard,
  Phone,
  Wifi,
  Home,
  RefreshCw,
  Repeat,
  Shield,
  Coffee,
  Dumbbell,
  BookOpen,
  Gamepad2,
  Music,
  Baby,
  Stethoscope,
  Laptop,
  Smartphone,
  Flame,
  Tv,
  Landmark,
  Receipt,
  PiggyBank,
  TrendingUp,
  ShoppingCart,
  Wrench,
  Hammer,
  Flower2,
  Plane,
  Camera,
  Luggage,
  Smile,
  Tag,
  Briefcase,
  Users,
  Train,
  Palette,
  Bike,
  Clapperboard,
  Sparkle,
  Wallet,
  Clock,
  Layers,
} from "lucide-react";

export const STORAGE_KEY_CATEGORIES = "HomeBudget_Categories";

// Comprehensive Icon Map for components
export const AVAILABLE_ICONS_MAP: Record<string, React.ElementType> = {
  // Essentials & Utilities
  Droplets,
  Zap,
  Flame,
  Home,
  Wifi,
  Phone,
  Smartphone,
  Tv,
  Laptop,
  CreditCard,
  Landmark,
  Receipt,
  PiggyBank,
  TrendingUp,
  Wallet,
  Shield,
  RefreshCw,
  Repeat,

  // Food & Dining
  Utensils,
  UtensilsCrossed,
  Coffee,
  ShoppingCart,
  ShoppingBag,

  // Transport & Travel
  Fuel,
  Car,
  Bus,
  Train,
  Plane,
  Bike,
  CarTaxiFront,
  Luggage,

  // Health & Personal Care
  Heart,
  Pill,
  Stethoscope,
  Scissors,
  Sparkles,
  Sparkle,

  // Lifestyle & Entertainment
  Dumbbell,
  Film,
  Clapperboard,
  Music,
  Gamepad2,
  BookOpen,
  Camera,
  Palette,

  // Family, Pets & Home
  Baby,
  PawPrint,
  Shirt,
  Gift,
  GraduationCap,
  Wrench,
  Hammer,
  Flower2,

  // General & Business
  Tag,
  Briefcase,
  Users,
  Smile,
  Clock,
  Layers,
  CircleHelp,
};

// Available Color Themes
export interface ColorOption {
  id: string;
  label: string;
  colorClass: string;
  previewBg: string;
}

export const COLOR_OPTIONS: ColorOption[] = [
  { id: "blue", label: "Синьо", colorClass: "bg-blue-100 text-blue-600", previewBg: "bg-blue-500" },
  { id: "indigo", label: "Индиго", colorClass: "bg-indigo-100 text-indigo-600", previewBg: "bg-indigo-500" },
  { id: "purple", label: "Лилаво", colorClass: "bg-purple-100 text-purple-600", previewBg: "bg-purple-500" },
  { id: "fuchsia", label: "Фуксия", colorClass: "bg-fuchsia-100 text-fuchsia-600", previewBg: "bg-fuchsia-500" },
  { id: "pink", label: "Розово", colorClass: "bg-pink-100 text-pink-500", previewBg: "bg-pink-500" },
  { id: "rose", label: "Рубин", colorClass: "bg-rose-100 text-rose-600", previewBg: "bg-rose-500" },
  { id: "red", label: "Червено", colorClass: "bg-red-100 text-red-600", previewBg: "bg-red-500" },
  { id: "orange", label: "Оранжево", colorClass: "bg-orange-100 text-orange-600", previewBg: "bg-orange-500" },
  { id: "amber", label: "Кехлибар", colorClass: "bg-amber-100 text-amber-600", previewBg: "bg-amber-500" },
  { id: "yellow", label: "Жълто", colorClass: "bg-yellow-100 text-yellow-600", previewBg: "bg-yellow-500" },
  { id: "emerald", label: "Изумруд", colorClass: "bg-emerald-100 text-emerald-600", previewBg: "bg-emerald-500" },
  { id: "teal", label: "Тюркоаз", colorClass: "bg-teal-100 text-teal-600", previewBg: "bg-teal-500" },
  { id: "cyan", label: "Циан", colorClass: "bg-cyan-100 text-cyan-600", previewBg: "bg-cyan-500" },
  { id: "sky", label: "Небесно", colorClass: "bg-sky-100 text-sky-600", previewBg: "bg-sky-500" },
  { id: "slate", label: "Сиво", colorClass: "bg-slate-100 text-slate-600", previewBg: "bg-slate-500" },
  { id: "zinc", label: "Тъмно сиво", colorClass: "bg-zinc-100 text-zinc-700", previewBg: "bg-zinc-600" },
];

// Predefined Initial Categories
export const DEFAULT_CATEGORIES: ExpenseCategory[] = [
  { id: "water", name: "Вода", iconName: "Droplets", colorClass: "bg-blue-100 text-blue-500" },
  { id: "electricity", name: "Ток", iconName: "Zap", colorClass: "bg-yellow-100 text-yellow-600" },
  { id: "fuel", name: "Гориво", iconName: "Fuel", colorClass: "bg-red-100 text-red-500" },
  { id: "car", name: "Кола", iconName: "Car", colorClass: "bg-zinc-100 text-zinc-600" },
  { id: "food", name: "Храна", iconName: "Utensils", colorClass: "bg-orange-100 text-orange-500" },
  { id: "hair", name: "Фризьор", iconName: "Scissors", colorClass: "bg-purple-100 text-purple-500" },
  { id: "restaurant", name: "Ресторант", iconName: "UtensilsCrossed", colorClass: "bg-yellow-100 text-yellow-600" },
  { id: "cinema", name: "Кино", iconName: "Film", colorClass: "bg-indigo-100 text-indigo-500" },
  { id: "pharmacy", name: "Аптека", iconName: "Pill", colorClass: "bg-emerald-100 text-emerald-600" },
  { id: "pets", name: "Домашни любимци", iconName: "PawPrint", colorClass: "bg-amber-100 text-amber-600" },
  { id: "cleaning", name: "Почистване", iconName: "Sparkles", colorClass: "bg-cyan-100 text-cyan-500" },
  { id: "clothes", name: "Дрехи", iconName: "Shirt", colorClass: "bg-pink-100 text-pink-500" },
  { id: "cosmetics", name: "Козметика", iconName: "Heart", colorClass: "bg-rose-100 text-rose-500" },
  { id: "gifts", name: "Подаръци", iconName: "Gift", colorClass: "bg-fuchsia-100 text-fuchsia-500" },
  { id: "education", name: "Образование", iconName: "GraduationCap", colorClass: "bg-blue-100 text-blue-500" },
  { id: "health", name: "Здраве", iconName: "Heart", colorClass: "bg-red-50 text-red-600" },
  { id: "transport", name: "Транспорт", iconName: "Bus", colorClass: "bg-slate-100 text-slate-600" },
  { id: "taxi", name: "Такси и услуги", iconName: "CarTaxiFront", colorClass: "bg-yellow-50 text-yellow-600" },
  { id: "other", name: "Други", iconName: "ShoppingBag", colorClass: "bg-emerald-100 text-emerald-500" },
];

/**
 * Smart AI Icon and Color Matcher
 * Uses semantic matching rules across Bulgarian and English keywords
 * to automatically assign the best matching Lucide icon and complementary color.
 */
export function getAiSuggestedIconAndColor(categoryName: string): {
  iconName: string;
  colorClass: string;
  keywordMatched?: string;
} {
  const norm = categoryName.trim().toLowerCase();

  // Keyword rules table
  const rules: { keywords: string[]; iconName: string; colorClass: string }[] = [
    // Sports & Fitness
    {
      keywords: ["спорт", "фитнес", "тренировк", "зала", "гимнастик", "йога", "gym", "fitness", "sport", "workout", "бягане", "плуване"],
      iconName: "Dumbbell",
      colorClass: "bg-amber-100 text-amber-700",
    },
    // Coffee & Drinks
    {
      keywords: ["кафе", "чай", "бар", "напитки", "кръчма", "коктейл", "coffee", "tea", "starbucks", "закуска"],
      iconName: "Coffee",
      colorClass: "bg-amber-100 text-amber-800",
    },
    // Restaurants & Food Delivery
    {
      keywords: ["ресторант", "пица", "бургер", "дюнер", "суши", "glovo", "takeaway", "вечеря", "обяд", "заведение", "скара", "сладкарниц", "ресторанти"],
      iconName: "UtensilsCrossed",
      colorClass: "bg-orange-100 text-orange-600",
    },
    // Groceries & Food Market
    {
      keywords: ["храна", "пазаруване", "супермаркет", "магазин", "лидл", "lidl", "kaufland", "billa", "фантастико", "плодове", "зеленчуци", "месо", "хляб", "бакалия", "groceries", "market"],
      iconName: "ShoppingCart",
      colorClass: "bg-emerald-100 text-emerald-600",
    },
    // Fuel & Gas
    {
      keywords: ["гориво", "бензин", "нафта", "газ", "дизел", "зареждане", "fuel", "petrol", "shell", "omv", "lukoil"],
      iconName: "Fuel",
      colorClass: "bg-red-100 text-red-600",
    },
    // Car & Auto Service
    {
      keywords: ["кола", "авто", "сервиз", "гуми", "паркинг", "винетка", "гражданска", "автомивка", "масло", "гараж", "car", "auto", "паркиране"],
      iconName: "Car",
      colorClass: "bg-zinc-100 text-zinc-700",
    },
    // Taxi & Ride Share
    {
      keywords: ["такси", "taxi", "uber", "bolt", "spark", "yellow", "ок супертранс"],
      iconName: "CarTaxiFront",
      colorClass: "bg-yellow-100 text-yellow-700",
    },
    // Travel & Vacation
    {
      keywords: ["пътуван", "екскурзи", "почивк", "ваканци", "хотел", "самолет", "билет", "летище", "курорт", "море", "планина", "travel", "flight", "trip"],
      iconName: "Plane",
      colorClass: "bg-sky-100 text-sky-600",
    },
    // Public Transport
    {
      keywords: ["транспорт", "метро", "автобус", "трамвай", "тролей", "влак", "бдж", "bus", "train", "карти градски"],
      iconName: "Bus",
      colorClass: "bg-slate-100 text-slate-700",
    },
    // Bicycle & Micro-mobility
    {
      keywords: ["колело", "велосипед", "тротинетка", "байк", "bike", "bicycle"],
      iconName: "Bike",
      colorClass: "bg-teal-100 text-teal-600",
    },
    // Gaming
    {
      keywords: ["игри", "гейминг", "steam", "playstation", "xbox", "nintendo", "game", "gaming"],
      iconName: "Gamepad2",
      colorClass: "bg-purple-100 text-purple-600",
    },
    // Cinema, Movies & Streaming
    {
      keywords: ["кино", "филм", "netflix", "hbo", "cinema", "movie", "театър", "спектакъл"],
      iconName: "Film",
      colorClass: "bg-indigo-100 text-indigo-600",
    },
    // Music & Concerts
    {
      keywords: ["музика", "spotify", "apple music", "концерт", "фестивал", "music", "песен"],
      iconName: "Music",
      colorClass: "bg-pink-100 text-pink-600",
    },
    // Books & Education
    {
      keywords: ["книга", "книги", "четене", "книжарница", "учебник", "курс", "курсове", "образование", "училище", "университет", "уроци", "обучение", "book", "education", "study"],
      iconName: "BookOpen",
      colorClass: "bg-blue-100 text-blue-600",
    },
    // Health, Doctors & Dentist
    {
      keywords: ["здраве", "лекар", "болница", "зъболекар", "преглед", "изследвания", "клиника", "стоматолог", "терапия", "health", "doctor", "dentist"],
      iconName: "Stethoscope",
      colorClass: "bg-rose-100 text-rose-600",
    },
    // Pharmacy & Medicine
    {
      keywords: ["аптека", "лекарств", "хапчет", "витамин", "медикамент", "pharmacy", "medicine", "pill"],
      iconName: "Pill",
      colorClass: "bg-emerald-100 text-emerald-600",
    },
    // Hair, Beauty & Barber
    {
      keywords: ["фризьор", "бръснар", "коса", "подстригване", "салон", "hair", "barber", "прическа"],
      iconName: "Scissors",
      colorClass: "bg-purple-100 text-purple-600",
    },
    // Cosmetics & Spa
    {
      keywords: ["козметика", "грим", "парфюм", "спа", "маникюр", "педикюр", "масаж", "beauty", "cosmetics", "грижа"],
      iconName: "Sparkles",
      colorClass: "bg-rose-100 text-rose-500",
    },
    // Clothes & Fashion
    {
      keywords: ["дрехи", "обувки", "мода", "яке", "палто", "дънки", "риза", "маратонки", "clothes", "fashion", "shopping"],
      iconName: "Shirt",
      colorClass: "bg-pink-100 text-pink-600",
    },
    // Pets & Animals
    {
      keywords: ["домашни любимци", "куче", "котка", "ветеринар", "зоомагазин", "гранули", "папагал", "pet", "pets", "dog", "cat"],
      iconName: "PawPrint",
      colorClass: "bg-amber-100 text-amber-700",
    },
    // Baby & Kids
    {
      keywords: ["бебе", "дете", "деца", "детска", "памперси", "детски", "играчки", "ясла", "baby", "kid", "kids"],
      iconName: "Baby",
      colorClass: "bg-sky-100 text-sky-500",
    },
    // Gifts & Celebrations
    {
      keywords: ["подарък", "подаръци", "рожден ден", "имен ден", "празник", "сватба", "юбилей", "gift", "presents"],
      iconName: "Gift",
      colorClass: "bg-fuchsia-100 text-fuchsia-600",
    },
    // Home, Rent & Property
    {
      keywords: ["дом", "наем", "квартира", "жилище", "имот", "вход", "домоуправител", "обзавеждане", "мебели", "ikea", "home", "rent"],
      iconName: "Home",
      colorClass: "bg-emerald-100 text-emerald-700",
    },
    // Utilities: Water
    {
      keywords: ["вода", "вик", "софийска вода", "water"],
      iconName: "Droplets",
      colorClass: "bg-blue-100 text-blue-500",
    },
    // Utilities: Electricity
    {
      keywords: ["ток", "електро", "електрохолд", "енерго", "evn", "electricity"],
      iconName: "Zap",
      colorClass: "bg-yellow-100 text-yellow-600",
    },
    // Utilities: Heating & Gas
    {
      keywords: ["парно", "топлофикация", "отопление", "газоподаване", "дърва", "пелети", "heating"],
      iconName: "Flame",
      colorClass: "bg-red-100 text-red-500",
    },
    // Internet & TV
    {
      keywords: ["интернет", "тв", "телевизия", "нет", "кабелна", "цифрова", "wifi", "internet", "a1 net", "vivacom net"],
      iconName: "Wifi",
      colorClass: "bg-cyan-100 text-cyan-600",
    },
    // Mobile Phone
    {
      keywords: ["телефон", "мобилен", "а1", "yettel", "йеттел", "vivacom", "виваком", "план", "phone", "mobile"],
      iconName: "Phone",
      colorClass: "bg-indigo-100 text-indigo-600",
    },
    // Banking & Loans
    {
      keywords: ["кредит", "заем", "вноска", "банка", "лихва", "ипотека", "лизинг", "дск", "fibank", "unicredit", "банкова такса", "bank", "loan", "credit"],
      iconName: "CreditCard",
      colorClass: "bg-blue-100 text-blue-700",
    },
    // Insurance
    {
      keywords: ["застраховка", "каско", "гражданска", "булинс", "дзи", "армеец", "алианц", "живот", "insurance"],
      iconName: "Shield",
      colorClass: "bg-red-100 text-red-600",
    },
    // Taxes & Government
    {
      keywords: ["данък", "данъци", "нап", "такса смет", "нотариус", "държавна такса", "мито", "tax", "taxes"],
      iconName: "Receipt",
      colorClass: "bg-slate-100 text-slate-700",
    },
    // Subscriptions & Recurring
    {
      keywords: ["абонамент", "месечен абонамент", "подновяване", "членство", "subscription", "recurring"],
      iconName: "RefreshCw",
      colorClass: "bg-purple-100 text-purple-600",
    },
    // Repairs & Tools
    {
      keywords: ["ремонт", "майстор", "инструменти", "боя", "строител", "железария", "практикер", "бриколаж", "bauhaus", "bricolage", "repair", "tools"],
      iconName: "Wrench",
      colorClass: "bg-amber-100 text-amber-700",
    },
    // Garden & Plants
    {
      keywords: ["градина", "цветя", "растения", "разсад", "тераса", "garden", "flowers"],
      iconName: "Flower2",
      colorClass: "bg-emerald-100 text-emerald-600",
    },
    // Electronics & Tech
    {
      keywords: ["техника", "компютър", "лаптоп", "монитор", "слушалки", "електроника", "технополис", "техномаркет", "laptop", "pc", "gadgets"],
      iconName: "Laptop",
      colorClass: "bg-blue-100 text-blue-600",
    },
    // Photography & Art
    {
      keywords: ["снимки", "фотография", "камера", "фото", "изкуство", "photo", "camera", "art"],
      iconName: "Camera",
      colorClass: "bg-purple-100 text-purple-600",
    },
    // Savings & Investments
    {
      keywords: ["спестяване", "спестявания", "инвестиции", "акции", "фонд", "крипто", "bitcoin", "savings", "invest"],
      iconName: "PiggyBank",
      colorClass: "bg-emerald-100 text-emerald-600",
    },
  ];

  // Try matching rule keywords
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (norm.includes(kw)) {
        return {
          iconName: rule.iconName,
          colorClass: rule.colorClass,
          keywordMatched: kw,
        };
      }
    }
  }

  // Fallback: deterministic smart hash based on characters
  const fallbackIcons = ["Tag", "Sparkles", "ShoppingBag", "Layers", "Smile", "Clock", "Briefcase"];
  const fallbackColors = [
    "bg-indigo-100 text-indigo-600",
    "bg-blue-100 text-blue-600",
    "bg-emerald-100 text-emerald-600",
    "bg-amber-100 text-amber-600",
    "bg-purple-100 text-purple-600",
    "bg-rose-100 text-rose-600",
    "bg-cyan-100 text-cyan-600",
  ];

  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash << 5) - hash + norm.charCodeAt(i);
    hash |= 0;
  }
  const pos = Math.abs(hash);
  const iconName = fallbackIcons[pos % fallbackIcons.length];
  const colorClass = fallbackColors[pos % fallbackColors.length];

  return { iconName, colorClass };
}

/**
 * Loads categories from localStorage. If none exist, initializes with default categories.
 * Automatically preserves any existing custom categories or modifications.
 */
export function loadStoredCategories(): ExpenseCategory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (!raw) {
      // Save defaults initially
      saveStoredCategories(DEFAULT_CATEGORIES);
      return DEFAULT_CATEGORIES;
    }

    const parsed = JSON.parse(raw);
    let loadedList: ExpenseCategory[] = [];

    // Support both CategoriesStore format { expenseCategories: [...] } and plain array [...]
    if (Array.isArray(parsed)) {
      loadedList = parsed;
    } else if (parsed && Array.isArray(parsed.expenseCategories)) {
      loadedList = parsed.expenseCategories;
    }

    if (loadedList.length === 0) {
      saveStoredCategories(DEFAULT_CATEGORIES);
      return DEFAULT_CATEGORIES;
    }

    // Ensure all predefined default categories exist in case this is a fresh setup or older storage
    const existingIds = new Set(loadedList.map((c) => c.id));
    const merged = [...loadedList];

    for (const def of DEFAULT_CATEGORIES) {
      if (!existingIds.has(def.id)) {
        merged.push(def);
        existingIds.add(def.id);
      }
    }

    return merged;
  } catch (err) {
    console.warn("Failed loading categories from storage:", err);
    return DEFAULT_CATEGORIES;
  }
}

/**
 * Saves categories to localStorage in a format fully compatible with Backup & Restore.
 */
export function saveStoredCategories(categories: ExpenseCategory[]): void {
  try {
    // Read existing store if available to preserve incomeCategories
    let existingIncomeCategories: ExpenseCategory[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.incomeCategories)) {
          existingIncomeCategories = parsed.incomeCategories;
        }
      }
    } catch {
      // ignore
    }

    const store: CategoriesStore = {
      expenseCategories: categories,
      incomeCategories: existingIncomeCategories,
    };

    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(store));
  } catch (err) {
    console.error("Failed saving categories to storage:", err);
  }
}

/**
 * Add a new category (creates unique id, uses smart AI defaults if not provided)
 */
export function addCategoryToStorage(category: Partial<ExpenseCategory> & { name: string }): ExpenseCategory[] {
  const current = loadStoredCategories();

  // AI-suggest icon and color if not provided
  const aiSuggestion = getAiSuggestedIconAndColor(category.name);

  const newCategory: ExpenseCategory = {
    id: category.id || `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: category.name.trim(),
    iconName: category.iconName || aiSuggestion.iconName,
    colorClass: category.colorClass || aiSuggestion.colorClass,
    isCustom: true,
  };

  const updated = [...current, newCategory];
  saveStoredCategories(updated);
  return updated;
}

/**
 * Update an existing category by ID
 */
export function updateCategoryInStorage(
  categoryId: string,
  updates: Partial<Pick<ExpenseCategory, "name" | "iconName" | "colorClass">>
): ExpenseCategory[] {
  const current = loadStoredCategories();
  const updated = current.map((cat) => {
    if (cat.id === categoryId) {
      return {
        ...cat,
        ...updates,
        name: updates.name ? updates.name.trim() : cat.name,
      };
    }
    return cat;
  });

  saveStoredCategories(updated);
  return updated;
}

/**
 * Delete a category by ID from storage
 */
export function deleteCategoryFromStorage(categoryId: string): ExpenseCategory[] {
  const current = loadStoredCategories();
  const updated = current.filter((cat) => cat.id !== categoryId);
  saveStoredCategories(updated);
  return updated;
}
