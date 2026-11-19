import React, { useEffect, useMemo, useRef, useState } from "react";
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
  EyeOff,
  Repeat,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { AppNotification, NotificationTarget } from "@/types";
import {
  formatBgDateFromIsoOrKey,
  getActiveNotifications,
  getHistoryNotifications,
  getUnreadNotificationsCount,
} from "@/utils/notificationsEngine";
import { NotificationsStoreState } from "@/types";

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
}

type CenterTab = "active" | "history";

function formatRelativeTimeBg(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return "Сега";
  if (diffMin < 60) return `Преди ${diffMin} мин`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Преди ${diffHours} ч`;
  return new Date(ts).toLocaleDateString("bg-BG", {
    day: "2-digit",
    month: "2-digit",
  });
}

function getStatusLabelBg(status: AppNotification["status"]): string {
  switch (status) {
    case "unread":
      return "Непрочетено";
    case "read":
      return "Прочетено";
    case "dismissed":
      return "Отхвърлено";
    case "resolved":
      return "Изпълнено";
  }
}

function getNotificationVisual(n: AppNotification): {
  icon: React.ComponentType<{ className?: string }>;
  containerClass: string;
} {
  if (n.status === "resolved") {
    return {
      icon: CheckCircle2,
      containerClass:
        "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400",
    };
  }
  switch (n.type) {
    case "overdue_expense":
    case "overdue_income":
      return {
        icon: AlertTriangle,
        containerClass:
          "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400",
      };
    case "upcoming_expense":
      return {
        icon: Clock,
        containerClass:
          "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400",
      };
    case "upcoming_income":
      return {
        icon: ArrowDownLeft,
        containerClass:
          "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400",
      };
    case "goal_milestone":
      return {
        icon: Target,
        containerClass:
          "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400",
      };
    case "recurring_generated":
      return {
        icon: Repeat,
        containerClass:
          "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400",
      };
    case "backup_success":
      return {
        icon: Cloud,
        containerClass:
          "bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400",
      };
  }
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  store,
  onMarkAsRead,
  onMarkAllAsRead,
  onDismiss,
  onDelete,
  onClearAll,
  onOpenTarget,
  onOpenCalendarDate,
  onCompleteTransaction,
}) => {
  const [isOpen, setIsOpen] = useState(false);
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
      // Only handle outside-click for desktop popover; mobile bottom sheet uses explicit backdrop
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

  const handleRowOpen = (n: AppNotification) => {
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

  const renderNotificationList = () => {
    if (displayedItems.length === 0) {
      return (
        <div className="py-12 px-6 text-center">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-3">
            <Bell className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {activeTab === "active"
              ? "Няма активни известия"
              : "Историята на известията е празна"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[260px] mx-auto">
            {activeTab === "active"
              ? "Когато настъпят предстоящи плащания, просрочия, цели или архивиране, ще ги видите тук."
              : "Прочетените, отхвърлените и автоматично изпълнените известия се съхраняват тук."}
          </p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
        {displayedItems.map((n) => {
          const { icon: IconComp, containerClass } = getNotificationVisual(n);
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

          return (
            <div
              key={n.id}
              onClick={() => handleRowOpen(n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleRowOpen(n);
                }
              }}
              className={`px-4 py-3.5 transition-colors cursor-pointer ${
                isUnread
                  ? "bg-indigo-50/35 hover:bg-indigo-50/70 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/35"
                  : "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${containerClass}`}
                >
                  <IconComp className="w-4 h-4" />
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isUnread && (
                        <span
                          className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0"
                          aria-label="Непрочетено"
                        />
                      )}
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate tabular-nums">
                        {n.title}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0 tabular-nums">
                      {formatRelativeTimeBg(n.updatedAt || n.createdAt)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-snug">
                    {isResolved && n.resolvedNote ? n.resolvedNote : n.message}
                  </p>

                  {/* Quiet unboxed metadata line */}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {n.dueDateKey && (
                      <>
                        <span>{formatBgDateFromIsoOrKey(n.dueDateKey)}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span>{getStatusLabelBg(n.status)}</span>
                    {isResolved && n.message && n.resolvedNote && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{n.message}</span>
                      </>
                    )}
                  </div>

                  {/* Interactive Actions Row */}
                  <div
                    className="flex items-center justify-between gap-2 pt-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center flex-wrap gap-1.5">
                      {canQuickComplete && n.target?.monthKey && n.target?.recordId && n.target?.recordListType && (
                        <button
                          type="button"
                          onClick={() =>
                            onCompleteTransaction(
                              n.target!.monthKey!,
                              n.target!.recordListType!,
                              n.target!.recordId!
                            )
                          }
                          className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Изпълнено</span>
                        </button>
                      )}

                      {n.target && (
                        <button
                          type="button"
                          onClick={() => handleRowOpen(n)}
                          className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Отвори</span>
                        </button>
                      )}

                      {calendarDate && n.target?.kind !== "calendar" && (
                        <button
                          type="button"
                          onClick={() => {
                            if (n.status === "unread") onMarkAsRead(n.id);
                            onOpenCalendarDate(calendarDate, n);
                            setIsOpen(false);
                          }}
                          className="min-h-[32px] inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          title="Покажи датата в Календар"
                        >
                          <CalendarDays className="w-3 h-3" />
                          <span>Календар</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => onMarkAsRead(n.id)}
                          title="Маркирай като прочетено"
                          aria-label="Маркирай като прочетено"
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                        >
                          <CheckCheck className="w-4 h-4" />
                        </button>
                      )}
                      {(n.status === "unread" || n.status === "read") && (
                        <button
                          type="button"
                          onClick={() => onDismiss(n.id)}
                          title="Отхвърли (премести в история)"
                          aria-label="Отхвърли"
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-amber-400 transition-colors cursor-pointer"
                        >
                          <EyeOff className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDelete(n.id)}
                        title="Изтрий известието"
                        aria-label="Изтрий известието"
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPanelHeader = (isMobile: boolean) => (
    <div className="px-4 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800 space-y-3 shrink-0 bg-white dark:bg-slate-900">
      {isMobile && (
        <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-1" />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Известия
          </h3>
          {unreadCount > 0 && (
            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
              · {unreadCount} нови
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Маркирай всички като прочетени"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Прочетени</span>
            </button>
          )}
          {store.notifications.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Изчисти всички известия"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Изчисти</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Затвори известията"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Segmented Tabs: Активни | История */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveTab("active")}
          className={`min-h-[34px] py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap tabular-nums ${
            activeTab === "active"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          Активни ({activeItems.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`min-h-[34px] py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap tabular-nums ${
            activeTab === "history"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          История ({historyItems.length})
        </button>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Header Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={
          unreadCount > 0
            ? `Известия (${unreadCount} непрочетени)`
            : "Известия"
        }
        aria-expanded={isOpen}
        title={
          unreadCount > 0
            ? `Известия (${unreadCount} непрочетени)`
            : "Център за известия"
        }
        className={`relative min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
          isOpen
            ? "bg-indigo-50 dark:bg-indigo-950/70 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
            : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums shadow-xs ring-2 ring-white dark:ring-slate-900">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Desktop Popover Panel (>= md) */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Център за известия"
          className="hidden md:flex flex-col absolute right-0 top-full mt-2 w-[420px] max-w-[calc(100vw-2rem)] max-h-[min(78vh,600px)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {renderPanelHeader(false)}
          <div className="overflow-y-auto flex-1 overscroll-contain">
            {renderNotificationList()}
          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet (< md) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[70] md:hidden flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Център за известия"
        >
          <div
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            aria-hidden="true"
          />
          <div className="relative z-10 bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-5 duration-200 pb-safe">
            {renderPanelHeader(true)}
            <div className="overflow-y-auto flex-1 overscroll-contain">
              {renderNotificationList()}
            </div>
            <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold cursor-pointer active:scale-[0.99] transition-transform"
              >
                Затвори
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
