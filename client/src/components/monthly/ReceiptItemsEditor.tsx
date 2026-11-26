import React, { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckSquare,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Square,
  Trash2,
} from "lucide-react";
import { ReceiptItemDetail } from "@/types";
import {
  formatSignedCurrency,
  isDiscountReceiptItem,
  isTipReceiptItem,
} from "@/utils/expenseFormatter";
import { useI18n } from "@/i18n";

export interface ReceiptItemsEditorProps {
  mode: "scanReview" | "manualExpense";
  items: ReceiptItemDetail[];
  onChangeItems: (
    nextItems: ReceiptItemDetail[],
    nextSelectedIndices: Set<number>
  ) => void;
  currency?: string;
  onValidationError?: (message: string | null) => void;

  // Scan-review specific controls & summary
  selectedIndices?: Set<number>;
  onToggleItem?: (index: number) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  splitBillEnabled?: boolean;
  onToggleSplitBill?: (nextEnabled: boolean) => void;
  onOpenTipModal?: () => void;
  existingTipItem?: ReceiptItemDetail | null;
  onOpenDiscountModal?: () => void;
  negativeDiscountCount?: number;
  negativeDiscountSum?: number;
  attachedDiscountSum?: number;
  expectedItemsCount?: number | null;
  receiptTotalDisplay?: number;
  hasFullReceiptMismatch?: boolean;
  hasSevereMismatch?: boolean;
  aiUnavailable?: boolean;
  aiSucceeded?: boolean;
  mismatchDifference?: number;
  mismatchPercent?: number;
  confirmMismatchOverride?: boolean;
  onConfirmMismatchOverrideChange?: (checked: boolean) => void;

  // Optional Add-Expense total resync affordance
  onRequestSyncAmount?: (sum: number) => void;
  showSyncAmountAction?: boolean;
}

export const ReceiptItemsEditor: React.FC<ReceiptItemsEditorProps> = ({
  mode,
  items,
  onChangeItems,
  currency = "€",
  onValidationError,
  selectedIndices,
  onToggleItem,
  onSelectAll,
  onDeselectAll,
  splitBillEnabled = false,
  onToggleSplitBill,
  onOpenTipModal,
  existingTipItem,
  onOpenDiscountModal,
  negativeDiscountCount = 0,
  negativeDiscountSum = 0,
  attachedDiscountSum = 0,
  expectedItemsCount,
  receiptTotalDisplay = 0,
  hasFullReceiptMismatch = false,
  hasSevereMismatch = false,
  aiUnavailable = false,
  aiSucceeded = false,
  mismatchDifference = 0,
  mismatchPercent = 0,
  confirmMismatchOverride = false,
  onConfirmMismatchOverrideChange,
  onRequestSyncAmount,
  showSyncAmountAction = false,
}) => {
  const { language, t } = useI18n();
  const isScanReview = mode === "scanReview";
  const activeSelected =
    selectedIndices ?? new Set(items.map((_, idx) => idx));

  // Shared inline add & edit item state
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("1");
  const [newItemPrice, setNewItemPrice] = useState("");

  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemQuantity, setEditItemQuantity] = useState("1");
  const [editItemPrice, setEditItemPrice] = useState("");
  const [editItemIsDiscount, setEditItemIsDiscount] = useState(false);

  const [localError, setLocalError] = useState<string | null>(null);

  const reportError = (msg: string | null) => {
    setLocalError(msg);
    onValidationError?.(msg);
  };

  const fmtPrice = (val: number) => formatSignedCurrency(val, currency);

  const handleAddManualItem = () => {
    const cleanName = newItemName.trim();
    const parsedQty = Math.max(
      1,
      Math.round(parseFloat(newItemQuantity.replace(",", ".")) || 1)
    );
    const parsedPrice = parseFloat(newItemPrice.replace(",", "."));
    if (!cleanName) {
      reportError(t("ocr.errEmptyItemName"));
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      reportError(t("ocr.errInvalidItemPrice"));
      return;
    }

    const nextItems: ReceiptItemDetail[] = [
      ...items,
      {
        name: cleanName,
        quantity: parsedQty,
        price: parseFloat(parsedPrice.toFixed(2)),
      },
    ];
    const nextSelected = new Set(activeSelected);
    nextSelected.add(nextItems.length - 1);
    reportError(null);
    onChangeItems(nextItems, nextSelected);

    setNewItemName("");
    setNewItemQuantity("1");
    setNewItemPrice("");
    setShowAddItemForm(false);
  };

  const handleStartEditItem = (idx: number) => {
    const target = items[idx];
    if (!target) return;
    const netPrice = target.finalPrice ?? target.price;
    const isNegDiscount = netPrice < 0;
    setEditingItemIndex(idx);
    setEditItemName(target.name);
    setEditItemQuantity(
      String(target.quantity && target.quantity >= 1 ? target.quantity : 1)
    );
    setEditItemIsDiscount(isNegDiscount);
    setEditItemPrice(
      isNegDiscount ? Math.abs(netPrice).toFixed(2) : netPrice.toFixed(2)
    );
    reportError(null);
  };

  const handleSaveEditItem = (idx: number) => {
    const cleanName = editItemName.trim();
    const parsedQty = Math.max(
      1,
      Math.round(parseFloat(editItemQuantity.replace(",", ".")) || 1)
    );
    const rawParsedPrice = parseFloat(editItemPrice.replace(",", "."));
    if (!cleanName) {
      reportError(t("ocr.errEmptyItemName"));
      return;
    }
    const validPrice = editItemIsDiscount
      ? !isNaN(rawParsedPrice) && Math.abs(rawParsedPrice) > 0
      : !isNaN(rawParsedPrice) && rawParsedPrice > 0;
    if (!validPrice) {
      reportError(t("ocr.errInvalidItemPrice"));
      return;
    }

    const nextPrice = editItemIsDiscount
      ? parseFloat((-Math.abs(rawParsedPrice)).toFixed(2))
      : parseFloat(rawParsedPrice.toFixed(2));

    const nextItems = items.map((it, i) => {
      if (i !== idx) return it;
      if (!editItemIsDiscount && it.originalPrice && it.originalPrice > nextPrice) {
        return {
          ...it,
          name: cleanName,
          quantity: parsedQty,
          price: nextPrice,
          finalPrice: nextPrice,
          discount: parseFloat((it.originalPrice - nextPrice).toFixed(2)),
        };
      }
      return {
        name: cleanName,
        quantity: parsedQty,
        price: nextPrice,
      };
    });

    reportError(null);
    onChangeItems(nextItems, new Set(activeSelected));
    setEditingItemIndex(null);
    setEditItemIsDiscount(false);
  };

  const handleDeleteItem = (idx: number) => {
    const nextItems = items.filter((_, i) => i !== idx);
    const nextSelected = new Set<number>();
    activeSelected.forEach((selectedIdx) => {
      if (selectedIdx < idx) nextSelected.add(selectedIdx);
      else if (selectedIdx > idx) nextSelected.add(selectedIdx - 1);
    });
    if (editingItemIndex === idx) {
      setEditingItemIndex(null);
      setEditItemIsDiscount(false);
    } else if (editingItemIndex !== null && editingItemIndex > idx) {
      setEditingItemIndex(editingItemIndex - 1);
    }
    reportError(null);
    onChangeItems(nextItems, nextSelected);
  };

  const itemsFullSum = parseFloat(
    items
      .reduce((sum, item) => sum + (item.finalPrice ?? item.price), 0)
      .toFixed(2)
  );
  const selectedItemsList = items.filter((_, idx) => activeSelected.has(idx));
  const isPartialSelection =
    isScanReview && items.length > 0 && activeSelected.size < items.length;
  const selectedItemsSum = parseFloat(
    selectedItemsList
      .reduce((sum, item) => sum + (item.finalPrice ?? item.price), 0)
      .toFixed(2)
  );
  const activeDiscountSummary = parseFloat(
    (
      (isPartialSelection
        ? selectedItemsList.reduce((sum, item) => sum + (item.discount || 0), 0)
        : attachedDiscountSum) +
      (isPartialSelection
        ? selectedItemsList
            .filter(isDiscountReceiptItem)
            .reduce(
              (sum, item) => sum + Math.abs(item.finalPrice ?? item.price),
              0
            )
        : negativeDiscountSum)
    ).toFixed(2)
  );

  return (
    <div
      className={
        isScanReview
          ? "bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-2xs space-y-3"
          : "bg-slate-50/70 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3"
      }
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
            <ListChecks className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              {isScanReview
                ? t("ocr.receiptItemsHeader", { count: items.length })
                : t("expenses.optionalItemsSectionLabel")}
            </span>
            {!isScanReview && items.length > 0 && (
              <span className="ml-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300">
                {items.length}
              </span>
            )}
          </h4>
          {isScanReview && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
              {t("ocr.receiptItemsSub")}
            </p>
          )}
        </div>
        <div className="flex items-center flex-wrap gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowAddItemForm((prev) => !prev);
              setEditingItemIndex(null);
              reportError(null);
            }}
            className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-[0.99]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("ocr.addManualItemBtn")}</span>
          </button>
          {isScanReview && items.length > 0 && (
            <>
              <button
                type="button"
                onClick={onSelectAll}
                disabled={activeSelected.size === items.length}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors flex items-center gap-1 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{t("ocr.selectAllBtn")}</span>
              </button>
              <button
                type="button"
                onClick={onDeselectAll}
                disabled={activeSelected.size === 0}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>{t("ocr.clearAllBtn")}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scan-Review Operations: Split Bill + Add Tip + Add Discount */}
      {isScanReview && (
        <div className="space-y-2 pb-2 border-b border-slate-200 dark:border-slate-800">
          {items.length > 0 && onToggleSplitBill && (
            <button
              type="button"
              role="switch"
              aria-checked={splitBillEnabled}
              onClick={() => onToggleSplitBill(!splitBillEnabled)}
              className="inline-flex items-center justify-between gap-4 px-3.5 py-2 rounded-xl bg-slate-50/90 dark:bg-slate-800/75 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-colors cursor-pointer select-none min-h-[40px]"
            >
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
                {t("ocr.splitBillLabel")}
              </span>
              <span
                aria-hidden="true"
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  splitBillEnabled
                    ? "bg-indigo-600"
                    : "bg-slate-300 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-xs transition-transform ${
                    splitBillEnabled ? "translate-x-5.5" : "translate-x-1"
                  }`}
                />
              </span>
            </button>
          )}

          <div
            className={`space-y-2 ${
              items.length > 0
                ? "pt-1.5 border-t border-slate-100 dark:border-slate-800/80"
                : ""
            }`}
          >
            {onOpenTipModal && (
              <div>
                <button
                  type="button"
                  onClick={onOpenTipModal}
                  className="min-h-[40px] w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80 transition-colors flex items-center justify-center sm:justify-start gap-2 cursor-pointer shadow-2xs active:scale-[0.99]"
                >
                  <span aria-hidden="true">💰</span>
                  <span>{t("ocr.addTipLabel")}</span>
                  {existingTipItem && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-200/80 dark:bg-amber-800/80 text-amber-950 dark:text-amber-100 tabular-nums">
                      {fmtPrice(
                        existingTipItem.finalPrice ?? existingTipItem.price
                      )}
                    </span>
                  )}
                </button>
              </div>
            )}

            {onOpenDiscountModal && (
              <div>
                <button
                  type="button"
                  onClick={onOpenDiscountModal}
                  className="min-h-[40px] w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700/80 transition-colors flex items-center justify-center sm:justify-start gap-2 cursor-pointer shadow-2xs active:scale-[0.99]"
                >
                  <span aria-hidden="true">🏷</span>
                  <span>{t("ocr.addDiscountLabel")}</span>
                  {negativeDiscountSum > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-200/80 dark:bg-emerald-800/80 text-emerald-950 dark:text-emerald-100 tabular-nums">
                      {negativeDiscountCount > 1
                        ? `${negativeDiscountCount} · `
                        : ""}
                      {fmtPrice(-negativeDiscountSum)}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Add Item Inline Form */}
      {showAddItemForm && (
        <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2.5">
          <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">
            {t("ocr.newItemHeader")}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
            <div className="col-span-2 sm:col-span-6">
              <input
                type="text"
                value={newItemName}
                onChange={(e) => {
                  setNewItemName(e.target.value);
                  if (localError) reportError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddManualItem();
                  }
                }}
                placeholder={t("ocr.newItemNamePlaceholder")}
                className="w-full min-h-[42px] sm:min-h-[38px] px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
            </div>
            <div className="col-span-1 sm:col-span-3">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={newItemQuantity}
                onChange={(e) => {
                  setNewItemQuantity(e.target.value);
                  if (localError) reportError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddManualItem();
                  }
                }}
                placeholder={t("ocr.qtyPlaceholder")}
                className="w-full min-h-[42px] sm:min-h-[38px] px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="col-span-1 sm:col-span-3">
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={newItemPrice}
                onChange={(e) => {
                  setNewItemPrice(e.target.value);
                  if (localError) reportError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddManualItem();
                  }
                }}
                placeholder={t("ocr.pricePlaceholder", { currency })}
                className="w-full min-h-[42px] sm:min-h-[38px] px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          {!onValidationError && localError && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
              {localError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddItemForm(false);
                reportError(null);
              }}
              className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleAddManualItem}
              className="min-h-[36px] px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t("common.add")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Items List + Inline Editing */}
      {items.length === 0 ? (
        <div className="py-3.5 px-3 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center text-xs text-slate-600 dark:text-slate-300">
          {isScanReview
            ? t("ocr.noItemsAutoHint")
            : t("expenses.emptyManualItemsHint")}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
          {items.map((item, idx) => {
            const isChecked = !isScanReview || activeSelected.has(idx);
            const isEditing = editingItemIndex === idx;
            const netPrice = item.finalPrice ?? item.price;
            const isNegDiscount = isDiscountReceiptItem(item);
            const isTip = isTipReceiptItem(item);

            if (isEditing) {
              return (
                <div
                  key={`edit-${idx}`}
                  className="p-2.5 rounded-xl border-2 border-indigo-400 dark:border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 space-y-2"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      value={editItemName}
                      onChange={(e) => {
                        setEditItemName(e.target.value);
                        if (localError) reportError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveEditItem(idx);
                        }
                      }}
                      placeholder={t("ocr.editItemNamePlaceholder")}
                      className="col-span-2 sm:col-span-6 min-h-[38px] px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={editItemQuantity}
                      onChange={(e) => {
                        setEditItemQuantity(e.target.value);
                        if (localError) reportError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveEditItem(idx);
                        }
                      }}
                      placeholder={t("ocr.qtyPlaceholder")}
                      className="col-span-1 sm:col-span-3 min-h-[38px] px-2.5 py-1.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="col-span-1 sm:col-span-3 relative">
                      {editItemIsDiscount && (
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300 pointer-events-none">
                          -{currency}
                        </span>
                      )}
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        value={editItemPrice}
                        onChange={(e) => {
                          setEditItemPrice(e.target.value);
                          if (localError) reportError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSaveEditItem(idx);
                          }
                        }}
                        placeholder={t("ocr.editPricePlaceholder")}
                        className={`w-full min-h-[38px] py-1.5 pr-2.5 text-xs sm:text-sm bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 ${
                          editItemIsDiscount ? "pl-8" : "pl-2.5"
                        }`}
                      />
                    </div>
                  </div>
                  {!onValidationError && localError && (
                    <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                      {localError}
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItemIndex(null);
                        setEditItemIsDiscount(false);
                        reportError(null);
                      }}
                      className="min-h-[34px] px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveEditItem(idx)}
                      className="min-h-[34px] px-3 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Save className="w-3 h-3" />
                      <span>{t("common.save")}</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`${idx}-${item.name}`}
                className={`min-h-[46px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-all ${
                  !isChecked
                    ? "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 opacity-75 hover:opacity-100"
                    : isNegDiscount
                    ? "bg-emerald-50/75 dark:bg-emerald-950/35 border-emerald-300 dark:border-emerald-700/80 text-slate-900 dark:text-white shadow-2xs"
                    : isScanReview
                    ? "bg-indigo-50/70 dark:bg-indigo-950/35 border-indigo-300 dark:border-indigo-700/80 text-slate-900 dark:text-white shadow-2xs"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white shadow-2xs"
                }`}
              >
                {isScanReview ? (
                  <label className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleItem?.(idx)}
                      className="w-4.5 h-4.5 mt-0.5 rounded-md border-slate-400 text-indigo-600 focus:ring-2 focus:ring-indigo-500 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <span
                        className={`block text-xs sm:text-sm font-semibold truncate ${
                          !isChecked ? "line-through" : ""
                        }`}
                      >
                        {isTip ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-xs font-bold">
                            <span aria-hidden="true">💰</span>
                            <span>
                              {language === "bg"
                                ? item.name
                                : t("expenses.tipLabel").replace(/:$/, "")}
                            </span>
                          </span>
                        ) : isNegDiscount ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/55 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 text-xs font-bold">
                            <span aria-hidden="true">🏷</span>
                            <span>
                              {item.quantity && item.quantity > 1
                                ? `${item.quantity} x ${item.name}`
                                : item.name}
                            </span>
                          </span>
                        ) : (
                          <>
                            {item.quantity && item.quantity >= 1
                              ? `${item.quantity} x `
                              : "1 x "}
                            {item.name}
                          </>
                        )}
                      </span>
                      {item.discount &&
                        item.discount > 0 &&
                        item.originalPrice !== undefined && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
                            <span className="text-slate-500 dark:text-slate-400 line-through">
                              {fmtPrice(item.originalPrice)}
                            </span>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              -{fmtPrice(item.discount)}{" "}
                              {item.discountLabel || t("ocr.discountWord")}
                            </span>
                            <span className="text-slate-600 dark:text-slate-300 font-medium">
                              {t("ocr.finalItemPrice", {
                                price: fmtPrice(netPrice),
                              })}
                            </span>
                          </div>
                        )}
                    </div>
                  </label>
                ) : (
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs sm:text-sm font-semibold truncate">
                      {isNegDiscount ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/55 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 text-xs font-bold">
                          <span aria-hidden="true">🏷</span>
                          <span>
                            {item.quantity && item.quantity > 1
                              ? `${item.quantity} x ${item.name}`
                              : item.name}
                          </span>
                        </span>
                      ) : (
                        <>
                          {item.quantity && item.quantity >= 1
                            ? `${item.quantity} x `
                            : "1 x "}
                          {item.name}
                        </>
                      )}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="text-right mr-1">
                    {item.discount &&
                      item.discount > 0 &&
                      item.originalPrice !== undefined && (
                        <span className="block text-[10px] text-slate-400 dark:text-slate-500 line-through tabular-nums leading-none mb-0.5">
                          {fmtPrice(item.originalPrice)}
                        </span>
                      )}
                    <span
                      className={`text-xs sm:text-sm font-extrabold tabular-nums ${
                        !isChecked
                          ? "text-slate-500 dark:text-slate-400 line-through"
                          : isNegDiscount
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-indigo-700 dark:text-indigo-300"
                      }`}
                    >
                      {fmtPrice(netPrice)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStartEditItem(idx)}
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
                    title={t("ocr.editItemTooltip")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(idx)}
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-rose-100/70 dark:hover:bg-rose-900/40 transition-colors cursor-pointer"
                    title={t("ocr.removeItemTooltip")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Expense Items Total Summary */}
      {!isScanReview && items.length > 0 && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {t("ocr.itemsTotalLabel")}:
            </span>
            <span className="font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums text-sm">
              {fmtPrice(itemsFullSum)}
            </span>
          </div>
          {showSyncAmountAction && onRequestSyncAmount && itemsFullSum > 0 && (
            <button
              type="button"
              onClick={() => onRequestSyncAmount(itemsFullSum)}
              className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold transition-colors cursor-pointer"
            >
              {t("expenses.syncAmountFromItems", {
                amount: fmtPrice(itemsFullSum),
              })}
            </button>
          )}
        </div>
      )}

      {/* Scan-Review Summary Grid & Mismatch Warning */}
      {isScanReview && items.length > 0 && (
        <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-xs">
          <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-600 dark:text-slate-300 block font-semibold">
              {expectedItemsCount
                ? t("ocr.expectedItemsCountLabel", {
                    count: expectedItemsCount,
                  })
                : t("ocr.selectedItemsLabel")}
            </span>
            <span className="font-bold text-slate-900 dark:text-white">
              {t("ocr.selectedOfTotalItems", {
                selected: activeSelected.size,
                total: items.length,
              })}
            </span>
          </div>
          <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <span className="text-[10px] text-emerald-700 dark:text-emerald-300 block font-semibold">
              {isPartialSelection
                ? t("ocr.selectedTotalLabel")
                : t("ocr.itemsTotalLabel")}
            </span>
            <span className="font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {fmtPrice(isPartialSelection ? selectedItemsSum : itemsFullSum)}
            </span>
            {activeDiscountSummary > 0 && (
              <span className="block text-[10px] font-semibold text-emerald-700/90 dark:text-emerald-300/90 tabular-nums">
                {t("ocr.discountsPrefix")} -{fmtPrice(activeDiscountSummary)}
              </span>
            )}
          </div>
          <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-[10px] text-slate-600 dark:text-slate-300 block font-semibold">
              {t("ocr.meterReceiptTotal")}
            </span>
            <span className="font-bold text-slate-900 dark:text-white tabular-nums">
              {fmtPrice(receiptTotalDisplay)}
            </span>
          </div>
        </div>
      )}

      {isScanReview && hasFullReceiptMismatch && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-300 dark:border-rose-700 rounded-xl text-xs text-rose-900 dark:text-rose-200 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <div className="space-y-1">
              {hasSevereMismatch ? (
                <div className="font-bold space-y-0.5">
                  {aiUnavailable && !aiSucceeded && (
                    <span className="block">
                      {t("ocr.severeMismatchAiUnavailableLine1")}
                    </span>
                  )}
                  <span className="block">{t("ocr.severeMismatchLine2")}</span>
                  <span className="block">{t("ocr.severeMismatchLine3")}</span>
                </div>
              ) : (
                <span className="font-bold block">{t("ocr.mismatchTitle")}</span>
              )}
              <p className="text-[11px] leading-relaxed">
                {t("ocr.mismatchDetails", {
                  receiptTotal: fmtPrice(receiptTotalDisplay),
                  itemsTotal: fmtPrice(itemsFullSum),
                  diff: fmtPrice(mismatchDifference),
                  pct: mismatchPercent.toFixed(1),
                })}
                {expectedItemsCount
                  ? t("ocr.mismatchItemsCount", {
                      detected: items.length,
                      expected: expectedItemsCount,
                    })
                  : ""}
              </p>
            </div>
          </div>
          {onConfirmMismatchOverrideChange && (
            <label className="flex items-center gap-2 pt-1.5 border-t border-rose-200 dark:border-rose-800/60 cursor-pointer select-none font-semibold text-[11px]">
              <input
                type="checkbox"
                checked={confirmMismatchOverride}
                onChange={(e) =>
                  onConfirmMismatchOverrideChange(e.target.checked)
                }
                className="w-4 h-4 rounded border-rose-400 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <span>{t("ocr.mismatchConfirmLabel")}</span>
            </label>
          )}
        </div>
      )}

      {isScanReview && items.length > 0 && activeSelected.size === 0 && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{t("ocr.selectOneItemWarning")}</span>
        </div>
      )}
    </div>
  );
};
