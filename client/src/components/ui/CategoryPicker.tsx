import React, { useState, useMemo } from 'react';
import { 
  Search, Plus, X, Fuel, Utensils, Scissors, 
  UtensilsCrossed, Film, ShoppingBag, CircleHelp,
  Car, Coffee, ShoppingCart, Home, Smartphone, Wifi,
  Pill, PawPrint, Sparkles, Shirt, Gift, GraduationCap,
  Heart, Bus, CarTaxiFront, Briefcase, Users, TrendingUp
} from 'lucide-react';
import { ExpenseCategory } from '@/types';

// Map of icon names to components
const IconMap: Record<string, React.ElementType> = {
  Fuel, Utensils, Scissors, UtensilsCrossed, Film, ShoppingBag, 
  Car, Coffee, ShoppingCart, Home, Smartphone, Wifi, CircleHelp,
  Pill, PawPrint, Sparkles, Shirt, Gift, GraduationCap,
  Heart, Bus, CarTaxiFront, Briefcase, Users, TrendingUp
};

interface CategoryPickerProps {
  categories: ExpenseCategory[];
  onSelect: (category: ExpenseCategory) => void;
  onClose: () => void;
  onAddNewCategory: (name: string) => void;
}

export const CategoryPicker: React.FC<CategoryPickerProps> = ({ 
  categories, 
  onSelect, 
  onClose,
  onAddNewCategory
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const filteredCategories = useMemo(() => {
    return categories.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [categories, searchTerm]);

  const handleCreateNew = () => {
    if (newCategoryName.trim()) {
      onAddNewCategory(newCategoryName.trim());
      setIsAddingNew(false);
      setNewCategoryName('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6">
      <div 
        className="bg-slate-50 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-10 fade-in duration-300"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 bg-white border-b border-slate-100 flex items-center gap-3 shadow-sm z-10">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Търсене"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-400"
              autoFocus={!isAddingNew}
            />
          </div>
          
          <button 
            onClick={() => setIsAddingNew(true)}
            className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap px-2 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Нова
          </button>
          
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4 bg-slate-50/50">
          
          {/* Add New Input Mode */}
          {isAddingNew && (
            <div className="mb-4 p-4 bg-white rounded-xl shadow-sm border border-blue-100 animate-in fade-in slide-in-from-top-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Име на нова категория
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Напр. Спорт"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateNew()}
                />
                <button
                  onClick={handleCreateNew}
                  disabled={!newCategoryName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="grid grid-cols-3 gap-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {filteredCategories.map((category, index) => {
              const Icon = IconMap[category.iconName] || CircleHelp;
              
              // Determine borders for dashed grid effect
              const isLastRow = index >= filteredCategories.length - (filteredCategories.length % 3 || 3);
              const isLastCol = (index + 1) % 3 === 0;

              return (
                <button
                  key={category.id}
                  onClick={() => onSelect(category)}
                  className={`
                    group flex flex-col items-center justify-center p-4 sm:p-6 gap-3 
                    hover:bg-slate-50 transition-all active:scale-95 outline-none focus:bg-slate-50
                    relative
                    ${!isLastCol ? 'border-r border-dashed border-slate-200' : ''}
                    ${index < filteredCategories.length - 3 ? 'border-b border-dashed border-slate-200' : ''}
                    border-b border-dashed border-slate-200 border-r
                  `}
                  style={{
                    borderRightWidth: (index + 1) % 3 === 0 ? '0px' : '1px',
                    borderBottomWidth: index >= filteredCategories.length - (filteredCategories.length % 3 === 0 ? 3 : filteredCategories.length % 3) ? '0px' : '1px'
                  }}
                >
                  <div className={`
                    w-12 h-12 rounded-full flex items-center justify-center shadow-sm 
                    ${category.colorClass} 
                    group-hover:scale-110 transition-transform duration-200
                  `}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-medium text-slate-600 text-center leading-tight line-clamp-2">
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>

          {filteredCategories.length === 0 && !isAddingNew && (
            <div className="text-center py-12 text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Няма намерени категории</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
