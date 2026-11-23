import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowDownLeft,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Cloud,
  ExternalLink,
  Repeat,
  Target,
  Trash2,
  X,
} from "lucide-react";
import {
  AppNotification,
  NotificationsStoreState,
  NotificationTarget,
} from "@/types";
import {
  formatBgDateFromIsoOrKey,
  getActiveNotifications,
  getHistoryNotifications,
  getUnreadNotificationsCount,
} from "@/utils/notificationsEngine";
import { LocationCard } from "@/components/common/LocationCard";
import {
  formatLocalizedDate,
  formatLocalizedDateTime,
  localizeNotification,
  useI18n,
} from "@/i18n";

interface NotificationCenterProps {
  store: NotificationsStoreState;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDismiss: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onOpenTarget: (target: NotificationTarget, notification: AppNotification) => void;
  onOpenCalendarDate: (dateKey: string, notification: AppNotification) => void;
  onCompleteTransaction: (
    monthKey: string,
    kind: "fixed" | "additional" | "income",
    recordId: string
  ) => void;
  defaultOpen?: boolean;
}

type CenterTab = "active" | "history";

function formatNotificationDueDate(
  raw: string,
  lang: "bg" | "en"
): string {
  const isoOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (isoOnly) {
    const dt = new Date(Number(isoOnly[1]), Number(isoOnly[2]) - 1, Number(isoOnly[3]), 12, 0, 0);
    return formatLocalizedDate(dt, lang);
  }
  const ts = Date.parse(raw);
  if (Number.isFinite(ts)) {
    return formatLocalizedDate(new Date(ts), lang);
  }
  return formatBgDateFromIsoOrKey(raw);
}

function getNotificationMeta(
  n: AppNotification,
  t: (key: string, params?: Record<string, string | number>) => string
): {
  typeLabel: string;
  datePrefix: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBoxClass: string;
  labelClass: string;
} {
  if (n.status === "resolved") {
    return {
      typeLabel: t("notifications.meta.resolvedType"),
      datePrefix: t("notifications.meta.resolvedDatePrefix"),
      icon: CheckCircle2,
      iconBoxClass:
        "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300",
      labelClass: "text-emerald-700 dark:text-emerald-300",
    };
  }

  switch (n.type) {
    case "overdue_expense":
      return {
        typeLabel: t("notifications.meta.overdueExpense"),
        datePrefix: t("notifications.meta.dueDatePrefix"),
        icon: AlertTriangle,
        iconBoxClass:
          "bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400",
        labelClass: "text-rose-600 dark:text-rose-400",
      };
    case "overdue_income":
      return {
        typeLabel: t("notifications.meta.overdueIncome"),
        datePrefix: t("notifications.meta.expectedOnPrefix"),
        icon: AlertTriangle,
        iconBoxClass:
          "bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400",
        labelClass: "text-rose-600 dark:text-rose-400",
      };
    case "upcoming_expense":
      return {
        typeLabel: t("notifications.meta.upcomingExpense"),
        datePrefix: t("notifications.meta.dueDatePrefix"),
        icon: Clock,
        iconBoxClass:
          "bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300",
        labelClass: "text-amber-700 dark:text-amber-300",
      };
    case "upcoming_income":
      return {
        typeLabel: t("notifications.meta.upcomingIncome"),
        datePrefix: t("notifications.meta.datePrefix"),
        icon: ArrowDownLeft,
        iconBoxClass:
          "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300",
        labelClass: "text-emerald-700 dark:text-emerald-300",
      };
    case "goal_milestone":
      return {
        typeLabel: t("notifications.meta.goalMilestone"),
        datePrefix: t("notifications.meta.achievedPrefix"),
        icon: Target,
        iconBoxClass:
          "bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300",
        labelClass: "text-indigo-700 dark:text-indigo-300",
      };
    case "recurring_generated":
      return {
        typeLabel: t("notifications.meta.recurringGenerated"),
        datePrefix: t("notifications.meta.datePrefix"),
        icon: Repeat,
        iconBoxClass:
          "bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300",
        labelClass: "text-indigo-700 dark:text-indigo-300",
      };
    case "backup_success":
      return {
        typeLabel: t("notifications.meta.backupSuccess"),
        datePrefix: t("notifications.meta.syncedPrefix"),
        icon: Cloud,
        iconBoxClass:
          "bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300",
        labelClass: "text-sky-700 dark:text-sky-300",
      };
  }
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  store,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
  onOpenTarget,
  onOpenCalendarDate,
  onCompleteTransaction,
  defaultOpen = false,
}) => {
  const { t, language } = useI18n();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeTab, setActiveTab] = useState<CenterTab>("active");
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = useMemo(() => getUnreadNotificationsCount(store), [store]);
  const activeItems = useMemo(() => getActiveNotifications(store), [store]);
  const historyItems = useMemo(() => getHistoryNotifications(store), [store]);

  const displayedItems = activeTab === "active" ? activeItems : historyItems;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (typeof window !== "undefined" && window.innerWidth < 768) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleToggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setActiveTab("active");
      }
      return next;
    });
  };

  const handleOpenNotification = (n: AppNotification) => {
    if (n.status === "unread") {
      onMarkAsRead(n.id);
    }
    if (n.target) {
      onOpenTarget(n.target, n);
      setIsOpen(false);
    } else if (n.dueDateKey) {
      onOpenCalendarDate(n.dueDateKey, n);
      setIsOpen(false);
    }
  };

  const renderHeader = (isMobile: boolean) => (
    <div className="px-4 pt-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 space-y-2">
      {isMobile && (
        <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
            {t("notifications.title")}
          </h3>
          {unreadCount > 0 && (
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums whitespace-nowrap">
              {t("notifications.unreadBadge", { count: unreadCount })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="min-h-[32px] inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{t("notifications.markAllRead")}</span>
            </button>
          )}
          {store.notifications.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="min-h-[32px] inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t("notifications.clearShort")}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label={t("notifications.closeAria")}
            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Compact Segmented Switch: Active | History */}
      <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <button
          type="button"
          onClick={() => setActiveTab("active")}
          className={`min-h-[32px] py-1 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
            activeTab === "active"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          {t("notifications.tabs.active")} ({activeItems.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`min-h-[32px] py-1 px-2.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
            activeTab === "history"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          {t("notifications.tabs.history")} ({historyItems.length})
        </button>
      </div>
    </div>
  );

  const renderCardsList = () => {
    if (displayedItems.length === 0) {
      return (
        <div className="py-6 px-4 text-center">
          <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-2">
            <Bell className="w-4 h-4" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {activeTab === "active"
              ? t("notifications.emptyActive")
              : t("notifications.emptyHistory")}
          </p>
        </div>
      );
    }

    return (
      <div className="p-3 space-y-2.5">
        {displayedItems.map((n) => {
          const meta = getNotificationMeta(n, t);
          const localized = localizeNotification(n, language);
          const IconComp = meta.icon;
          const isUnread = n.status === "unread";
          const isResolved = n.status === "resolved";
          const isTransactionAlert =
            n.type === "upcoming_expense" ||
            n.type === "upcoming_income" ||
            n.type === "overdue_expense" ||
            n.type === "overdue_income";
          const canQuickComplete =
            isTransactionAlert &&
            !isResolved &&
            n.status !== "dismissed" &&
            Boolean(n.target?.monthKey && n.target?.recordId && n.target?.recordListType);
          const calendarDate = n.target?.dateKey || n.dueDateKey;
          const displayDateValue = n.dueDateKey
            ? formatNotificationDueDate(n.dueDateKey, language)
            : formatLocalizedDateTime(n.updatedAt || n.createdAt, language);
          const displayDescription =
            isResolved && localized.resolvedNote
              ? localized.resolvedNote
              : localized.message;

          return (
            <div
              key={n.id}
              onClick={() => handleOpenNotification(n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpenNotification(n);
                }
              }}
              className={`rounded-xl border p-3 transition-colors cursor-pointer space-y-2 ${
                isUnread
                  ? "bg-indigo-50/40 dark:bg-indigo-950/25 border-indigo-200 dark:border-indigo-800/80"
                  : "bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/90 dark:border-slate-800"
              }`}
            >
              {/* Header line: Icon + Type label + Date/Time */}
              <div className="flex items-start gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBoxClass}`}
                >
                  <IconComp className="w-4 h-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-bold tracking-tight truncate ${meta.labelClass}`}
                    >
                      {meta.typeLabel}
                      {isUnread ? t("notifications.newTag") : ""}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (calendarDate) {
                          if (n.status === "unread") onMarkAsRead(n.id);
                          onOpenCalendarDate(calendarDate, n);
                          setIsOpen(false);
                        }
                      }}
                      disabled={!calendarDate}
                      className={`inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0 ${
                        calendarDate
                          ? "hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                          : "cursor-default"
                      }`}
                      title={
                        calendarDate
                          ? t("notifications.actions.openDateInCalendar")
                          : undefined
                      }
                    >
                      {calendarDate && <CalendarDays className="w-3 h-3 shrink-0" />}
                      <span>
                        {meta.datePrefix}: {displayDateValue}
                      </span>
                    </button>
                  </div>

                  {/* Primary Title + Amount */}
                  <p className="text-sm sm:text-[15px] font-bold text-slate-900 dark:text-white leading-snug mt-0.5 tabular-nums">
                    {localized.title}
                  </p>

                  {/* Reason / Description */}
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-snug mt-0.5">
                    {displayDescription}
                  </p>
                </div>
              </div>

              {(n.location?.placeName || n.location?.address) && (
                <LocationCard location={n.location} compact />
              )}

              {/* Direct Quick Actions Row */}
              <div
                className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200/70 dark:border-slate-700/60"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => handleOpenNotification(n)}
                  className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>{t("notifications.actions.open")}</span>
                </button>

                {canQuickComplete &&
                  n.target?.monthKey &&
                  n.target?.recordId &&
                  n.target?.recordListType && (
                    <button
                      type="button"
                      onClick={() =>
                        onCompleteTransaction(
                          n.target!.monthKey!,
                          n.target!.recordListType!,
                          n.target!.recordId!
                        )
                      }
                      className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t("notifications.completedAction")}</span>
                    </button>
                  )}

                {isUnread && (
                  <button
                    type="button"
                    onClick={() => onMarkAsRead(n.id)}
                    className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>{t("notifications.markRead")}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onDelete(n.id)}
                  className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t("common.delete")}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const mobileSheet =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] md:hidden flex flex-col justify-end"
            role="dialog"
            aria-modal="true"
            aria-label={t("notifications.centerAria")}
          >
            <div
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/55 backdrop-blur-xs"
              aria-hidden="true"
            />
            <div className="relative z-10 w-full bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[82vh] overflow-hidden pb-safe animate-in slide-in-from-bottom-4 duration-150">
              {renderHeader(true)}
              <div className="overflow-y-auto min-h-0 overscroll-contain">
                {renderCardsList()}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} className="relative shrink-0 pr-0.5">
      {/* Header Bell Trigger Button */}
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-label={
          unreadCount > 0
            ? t("notifications.unreadCountAria", { count: unreadCount })
            : t("notifications.title")
        }
        aria-expanded={isOpen}
        title={
          unreadCount > 0
            ? t("notifications.unreadCountAria", { count: unreadCount })
            : t("notifications.centerAria")
        }
        className={`relative min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
          isOpen
            ? "bg-indigo-50 dark:bg-indigo-950/70 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
            : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums shadow-xs ring-2 ring-white dark:ring-slate-900 pointer-events-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Desktop Popover (>= md) */}
      {isOpen && (
        <div
          role="dialog"
          aria-label={t("notifications.centerAria")}
          className="hidden md:flex flex-col absolute right-0 top-full mt-2 w-[430px] max-w-[calc(100vw-2rem)] max-h-[min(78vh,600px)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {renderHeader(false)}
          <div className="overflow-y-auto min-h-0 overscroll-contain">
            {renderCardsList()}
          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet (< md) portaled to document.body outside header backdrop-blur */}
      {mobileSheet}
    </div>
  );
};
