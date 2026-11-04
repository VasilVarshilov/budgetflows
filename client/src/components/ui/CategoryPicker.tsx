import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  Plus,
  X,
  Pencil,
  Trash2,
  Check,
  Sparkles,
  RotateCcw,
  AlertTriangle,
  FolderCog,
  ChevronRight,
  Info,
} from "lucide-react";
import { ExpenseCategory } from "@/types";
import {
  AVAILABLE_ICONS_MAP,
  COLOR_OPTIONS,
  getAiSuggestedIconAndColor,
  loadStoredCategories,
  addCategoryToStorage,
  updateCategoryInStorage,
  deleteCategoryFromStorage,
} from "@/utils/categoryStorage";

interface CategoryPickerProps {
  categories?: ExpenseCategory[];
  onSelect: (category: ExpenseCategory) => void;
  onClose: () => void;
  onAddNewCategory?: (category: ExpenseCategory) => void;
  onCategoriesChanged?: (updatedCategories: ExpenseCategory[]) => void;
}

export const CategoryPicker: React.FC<CategoryPickerProps> = ({
  categories: propCategories,
  onSelect,
  onClose,
  onAddNewCategory,
  onCategoriesChanged,
}) => {
  // Category list loaded from storage
  const [categories, setCategories] = useState<ExpenseCategory[]>(() => {
    return propCategories && propCategories.length > 0
      ? propCategories
      : loadStoredCategories();
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [isManageMode, setIsManageMode] = useState(false);

  // --- Add Category State ---
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState<string | null>(null);
  const [showIconSelector, setShowIconSelector] = useState(false);
  const [iconSearchTerm, setIconSearchTerm] = useState("");

  // AI-suggested icon & color based on current typing
  const aiSuggestion = useMemo(() => {
    if (!newCategoryName.trim()) {
      return { iconName: "Tag", colorClass: "bg-indigo-100 text-indigo-600" };
    }
    return getAiSuggestedIconAndColor(newCategoryName);
  }, [newCategoryName]);

  const activeNewIcon = customIcon || aiSuggestion.iconName;
  const activeNewColor = customColor || aiSuggestion.colorClass;

  // --- Edit Category State ---
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editColor, setEditColor] = useState("");
  const [showEditIconSelector, setShowEditIconSelector] = useState(false);

  // --- Delete Confirmation State ---
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categories.filter((c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [categories, searchTerm]);

  // Filtered icons for selector
  const availableIconKeys = useMemo(() => {
    return Object.keys(AVAILABLE_ICONS_MAP).filter((key) =>
      key.toLowerCase().includes(iconSearchTerm.toLowerCase())
    );
  }, [iconSearchTerm]);

  // Helper to notify changes
  const notifyChanges = (updated: ExpenseCategory[]) => {
    setCategories(updated);
    if (onCategoriesChanged) {
      onCategoriesChanged(updated);
    }
  };

  // --- Create Category Handler ---
  const handleCreateNew = () => {
    if (!newCategoryName.trim()) return;

    const newCat: ExpenseCategory = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newCategoryName.trim(),
      iconName: activeNewIcon,
      colorClass: activeNewColor,
      isCustom: true,
    };

    const updated = addCategoryToStorage(newCat);
    notifyChanges(updated);

    if (onAddNewCategory) {
      onAddNewCategory(newCat);
    }

    // Select the newly created category immediately
    onSelect(newCat);

    // Reset form
    setIsAddingNew(false);
    setNewCategoryName("");
    setCustomIcon(null);
    setCustomColor(null);
    setShowIconSelector(false);
  };

  // --- Start Editing Category ---
  const handleStartEdit = (e: React.MouseEvent, category: ExpenseCategory) => {
    e.stopPropagation();
    setEditingCategory(category);
    setEditName(category.name);
    setEditIcon(category.iconName);
    setEditColor(category.colorClass);
    setShowEditIconSelector(false);
  };

  // --- Save Edited Category ---
  const handleSaveEdit = () => {
    if (!editingCategory || !editName.trim()) return;

    const updated = updateCategoryInStorage(editingCategory.id, {
      name: editName.trim(),
      iconName: editIcon,
      colorClass: editColor,
    });

    notifyChanges(updated);
    setEditingCategory(null);
  };

  // --- Delete Category Handler ---
  const handleConfirmDelete = () => {
    if (!categoryToDelete) return;

    const updated = deleteCategoryFromStorage(categoryToDelete.id);
    notifyChanges(updated);
    setCategoryToDelete(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200/80 animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 duration-300"
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-slate-100 flex items-center justify-between gap-3 shadow-sm z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Избор на категория
              </h3>
              <p className="text-xs text-slate-400">
                {categories.length} активни категории
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Manage Mode Toggle Button */}
            <button
              onClick={() => setIsManageMode((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                isManageMode
                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200/80"
              }`}
              title={isManageMode ? "Изход от режим редакция" : "Редактиране или изтриване на категории"}
            >
              <FolderCog className="w-3.5 h-3.5" />
              <span>{isManageMode ? "Готово" : "Управление"}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Търсене на категория..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 text-slate-800"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!isAddingNew && (
            <button
              onClick={() => {
                setIsAddingNew(true);
                setNewCategoryName("");
                setCustomIcon(null);
                setCustomColor(null);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Нова</span>
            </button>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-4 bg-slate-50/40 space-y-4 flex-1">
          {/* Add New Category Panel */}
          {isAddingNew && (
            <div className="p-4 sm:p-5 bg-white rounded-2xl shadow-sm border-2 border-indigo-200 animate-in fade-in slide-in-from-top-3 relative space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Нова категория
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      AI автоматично ще избере най-подходяща икона и цвят
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddingNew(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Име на категорията
                </label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Напр. Фитнес, Кафе, Ресторант, Наем, Книги..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreateNew()}
                />
              </div>

              {/* Live AI Icon & Color Preview Box */}
              <div className="p-3 bg-gradient-to-r from-indigo-50/70 via-purple-50/60 to-pink-50/50 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-transform ${activeNewColor}`}
                  >
                    {AVAILABLE_ICONS_MAP[activeNewIcon] ? (
                      React.createElement(AVAILABLE_ICONS_MAP[activeNewIcon], {
                        className: "w-6 h-6 text-current",
                      })
                    ) : (
                      <Sparkles className="w-6 h-6 text-current" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">
                        {newCategoryName.trim() || "Примерна категория"}
                      </span>
                      {!customIcon && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-indigo-100/80 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                          <Sparkles className="w-2.5 h-2.5 text-indigo-600" />
                          AI икона ({activeNewIcon})
                        </span>
                      )}
                      {customIcon && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                          <Check className="w-2.5 h-2.5" />
                          Избрана ръчно
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Иконата ще се визуализира в отчетите и графиките
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowIconSelector((prev) => !prev)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                  >
                    {showIconSelector ? "Скрий икони" : "Смени иконка"}
                  </button>
                  {(customIcon || customColor) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomIcon(null);
                        setCustomColor(null);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors"
                      title="Върни AI предложението"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Icon & Color Selector Palette */}
              {showIconSelector && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in duration-200">
                  {/* Color Selector */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Избор на цвят:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {COLOR_OPTIONS.map((col) => {
                        const isSelected = activeNewColor === col.colorClass;
                        return (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => setCustomColor(col.colorClass)}
                            className={`w-6 h-6 rounded-full ${col.previewBg} flex items-center justify-center transition-all ${
                              isSelected
                                ? "ring-2 ring-offset-2 ring-indigo-600 scale-110 shadow-sm"
                                : "hover:scale-105 opacity-80 hover:opacity-100"
                            }`}
                            title={col.label}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Icon Selector Grid */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Избор на икона ({availableIconKeys.length}):
                      </label>
                      <input
                        type="text"
                        placeholder="Търси икона..."
                        value={iconSearchTerm}
                        onChange={(e) => setIconSearchTerm(e.target.value)}
                        className="px-2 py-0.5 text-xs bg-white border border-slate-200 rounded-md w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-7 sm:grid-cols-9 gap-1.5 max-h-36 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
                      {availableIconKeys.map((iconKey) => {
                        const IconComp = AVAILABLE_ICONS_MAP[iconKey];
                        const isSelected = activeNewIcon === iconKey;
                        return (
                          <button
                            key={iconKey}
                            type="button"
                            onClick={() => setCustomIcon(iconKey)}
                            className={`p-2 rounded-lg flex items-center justify-center transition-all ${
                              isSelected
                                ? "bg-indigo-600 text-white shadow-sm scale-105"
                                : "text-slate-600 hover:bg-slate-100"
                            }`}
                            title={iconKey}
                          >
                            <IconComp className="w-4 h-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Отказ
                </button>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  disabled={!newCategoryName.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold disabled:opacity-50 transition-all shadow-sm active:scale-95"
                >
                  Запази категорията
                </button>
              </div>
            </div>
          )}

          {/* Manage Mode Info Banner */}
          {isManageMode && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-amber-800 text-xs animate-in fade-in duration-200">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Режим на управление:</strong> Можете да редактирате имената и иконките на категориите или да ги изтривате чрез бутона за кошче.
              </span>
            </div>
          )}

          {/* Categories Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {filteredCategories.map((category) => {
              const IconComp = AVAILABLE_ICONS_MAP[category.iconName] || AVAILABLE_ICONS_MAP.Tag;

              return (
                <div
                  key={category.id}
                  className={`
                    group relative bg-white rounded-2xl p-3 sm:p-3.5 flex flex-col items-center justify-center gap-2
                    border border-slate-200/90 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer select-none
                    ${isManageMode ? "ring-1 ring-amber-200" : "active:scale-95"}
                  `}
                  onClick={() => {
                    if (!isManageMode) {
                      onSelect(category);
                    }
                  }}
                >
                  {/* Edit & Delete Action Buttons (visible on hover, or always in manage mode) */}
                  <div
                    className={`
                      absolute top-1.5 right-1.5 flex items-center gap-1 z-20
                      ${
                        isManageMode
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 transition-opacity"
                      }
                    `}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleStartEdit(e, category)}
                      className="p-1 rounded-md bg-white/95 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 shadow-sm border border-slate-200 transition-colors"
                      title="Редактирай категория и иконка"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCategoryToDelete(category);
                      }}
                      className="p-1 rounded-md bg-white/95 text-slate-500 hover:text-red-600 hover:bg-red-50 shadow-sm border border-slate-200 transition-colors"
                      title="Изтрий категория"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Category Icon Badge */}
                  <div
                    className={`
                      w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shadow-xs 
                      ${category.colorClass} 
                      group-hover:scale-105 transition-transform duration-200
                    `}
                  >
                    <IconComp className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>

                  {/* Category Name */}
                  <span className="text-xs font-semibold text-slate-700 text-center leading-tight line-clamp-2 px-1">
                    {category.name}
                  </span>

                  {/* Custom category pill if created by user */}
                  {category.isCustom && (
                    <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider bg-indigo-50 px-1.5 py-0.2 rounded">
                      Потребителска
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {filteredCategories.length === 0 && !isAddingNew && (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
              <Search className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600">
                Няма намерени категории за &quot;{searchTerm}&quot;
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Можете да създадете нова категория с това име чрез бутона &quot;Нова&quot;.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNewCategoryName(searchTerm);
                  setIsAddingNew(true);
                  setSearchTerm("");
                }}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Създай категория &quot;{searchTerm}&quot;
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 px-4">
          <span>Кликнете върху категория за избор</span>
          <span className="hidden sm:inline">Всички създадени категории се запазват автоматично</span>
        </div>
      </div>

      {/* --- Edit Category Modal --- */}
      {editingCategory && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm">
                  Редактиране на категория
                </h4>
              </div>
              <button
                onClick={() => setEditingCategory(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Име на категорията
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900"
              />
            </div>

            {/* Preview & Icon Toggle */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs ${editColor}`}
                >
                  {AVAILABLE_ICONS_MAP[editIcon] ? (
                    React.createElement(AVAILABLE_ICONS_MAP[editIcon], {
                      className: "w-6 h-6 text-current",
                    })
                  ) : (
                    <Sparkles className="w-6 h-6 text-current" />
                  )}
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    {editName || "Име"}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Икона: {editIcon}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditIconSelector((prev) => !prev)}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold shadow-xs"
              >
                {showEditIconSelector ? "Скрий икони" : "Смени иконка/цвят"}
              </button>
            </div>

            {/* Edit Icon & Color Selector Palette */}
            {showEditIconSelector && (
              <div className="p-3 bg-slate-100/70 rounded-xl border border-slate-200 space-y-3 max-h-52 overflow-y-auto">
                {/* Colors */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Цвят:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((col) => {
                      const isSelected = editColor === col.colorClass;
                      return (
                        <button
                          key={col.id}
                          type="button"
                          onClick={() => setEditColor(col.colorClass)}
                          className={`w-5 h-5 rounded-full ${col.previewBg} flex items-center justify-center transition-all ${
                            isSelected ? "ring-2 ring-offset-2 ring-indigo-600 scale-110" : "opacity-80"
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Icons */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Икона:
                  </label>
                  <div className="grid grid-cols-7 gap-1.5 max-h-28 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
                    {Object.keys(AVAILABLE_ICONS_MAP).map((iconKey) => {
                      const IconComp = AVAILABLE_ICONS_MAP[iconKey];
                      const isSelected = editIcon === iconKey;
                      return (
                        <button
                          key={iconKey}
                          type="button"
                          onClick={() => setEditIcon(iconKey)}
                          className={`p-1.5 rounded-md flex items-center justify-center transition-all ${
                            isSelected
                              ? "bg-indigo-600 text-white shadow-xs"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                          title={iconKey}
                        >
                          <IconComp className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Отказ
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!editName.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold disabled:opacity-50 transition-all shadow-sm active:scale-95"
              >
                Запази промените
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Delete Confirmation Modal --- */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h4 className="font-bold text-slate-800 text-base">
                Изтриване на категория?
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Сигурни ли сте, че искате да изтриете категорията &quot;<strong>{categoryToDelete.name}</strong>&quot;?
                Тя няма да бъде налична за избор при бъдещи разходи.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Отказ
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm active:scale-95"
              >
                Изтрий
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
