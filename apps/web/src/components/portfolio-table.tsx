"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, StatusBadge } from "@/ui/badge";
import { EmptyState } from "@/ui/states";
import { TermHint } from "@/ui/term-hint";

export type PortfolioRow = {
  id: string;
  name: string;
  projectStatus: string;
  platforms: string[];
  campaignStatus: string;
  websiteUrl: string | null;
  dailyBudget: number | null;
  spend7d: number;
  conversions7d: number;
  conversions30d: number;
  cpl7d: number | null;
  pacingPercent: number | null;
  pacingTone: "under" | "on_track" | "over" | "unknown";
  openRecommendations: number;
  unreadAlerts: number;
  hasUnreadAlerts: boolean;
  lastActionAt: string | null;
  favorite: boolean;
};

const PLATFORM_LABEL: Record<string, string> = {
  yandex_direct: "Яндекс",
  google_ads: "Google",
};

type SortKey =
  | "favorite"
  | "name"
  | "platforms"
  | "campaignStatus"
  | "pacingPercent"
  | "cpl7d"
  | "conversions7d"
  | "openRecommendations"
  | "unreadAlerts"
  | "lastActionAt";

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pacingKind(
  tone: PortfolioRow["pacingTone"],
): "alert" | "success" | "danger" | "draft" {
  if (tone === "under") return "alert";
  if (tone === "over") return "danger";
  if (tone === "on_track") return "success";
  return "draft";
}

function compare(a: PortfolioRow, b: PortfolioRow, key: SortKey): number {
  const av = a[key];
  const bv = b[key];
  if (key === "favorite") return Number(a.favorite) - Number(b.favorite);
  if (key === "platforms") {
    return (a.platforms.join(",") ?? "").localeCompare(b.platforms.join(","));
  }
  if (typeof av === "number" || typeof bv === "number") {
    return (Number(av ?? -Infinity) as number) - Number(bv ?? -Infinity);
  }
  return String(av ?? "").localeCompare(String(bv ?? ""), "ru");
}

export function PortfolioTable({
  rows,
  emptyTitle,
  emptyHint,
  onToggleFavorite,
}: {
  rows: PortfolioRow[];
  emptyTitle?: string;
  emptyHint?: string;
  onToggleFavorite: (id: string, favorite: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [campaignStatus, setCampaignStatus] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [alerts, setAlerts] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("favorite");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q)) return false;
      if (campaignStatus !== "all" && row.campaignStatus !== campaignStatus) {
        return false;
      }
      if (platform !== "all" && !row.platforms.includes(platform)) return false;
      if (alerts === "yes" && !row.hasUnreadAlerts) return false;
      if (alerts === "no" && row.hasUnreadAlerts) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      const diff = compare(a, b, sortKey);
      return sortDir === "asc" ? diff : -diff;
    });
    return sorted;
  }, [rows, query, campaignStatus, platform, alerts, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" || key === "platforms" ? "asc" : "desc");
  }

  function sortMark(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="min-w-44 flex-1 text-xs text-[var(--fg-muted)]">
          Поиск
          <input
            className="ui-input mt-1"
            placeholder="Поиск по названию"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="text-xs text-[var(--fg-muted)]">
          Статус кампании
          <select
            className="ui-input mt-1 w-40"
            aria-label="Фильтр по статусу"
            value={campaignStatus}
            onChange={(e) => setCampaignStatus(e.target.value)}
          >
            <option value="all">все</option>
            <option value="active">активна</option>
            <option value="paused">пауза</option>
            <option value="archived">архив</option>
            <option value="none">нет кампании</option>
          </select>
        </label>
        <label className="text-xs text-[var(--fg-muted)]">
          Платформа
          <select
            className="ui-input mt-1 w-40"
            aria-label="Фильтр по платформе"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="all">все</option>
            <option value="yandex_direct">Яндекс Директ</option>
            <option value="google_ads">Google Ads</option>
          </select>
        </label>
        <label className="text-xs text-[var(--fg-muted)]">
          Алерты
          <select
            className="ui-input mt-1 w-40"
            aria-label="Фильтр по алертам"
            value={alerts}
            onChange={(e) => setAlerts(e.target.value)}
          >
            <option value="all">все</option>
            <option value="yes">есть алерты</option>
            <option value="no">без алертов</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? "Создайте первый проект в мастере выше"}
        >
          {emptyHint ??
            "Пройдите шаги «О продукте» → «Аудитория и УТП» → «Бюджет и гео» → «Подключить кабинет». Строка появится в этой таблице."}
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="Сбросьте поиск или фильтр">
          В портфеле есть проекты, но они не подходят под текущие условия.
          Выберите «все» в фильтрах или очистите строку поиска.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="ui-table min-w-[920px]">
            <thead>
              <tr>
                <th>
                  <button type="button" onClick={() => toggleSort("favorite")}>
                    ★{sortMark("favorite")}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort("name")}>
                    Проект{sortMark("name")}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort("platforms")}>
                    Платформы{sortMark("platforms")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    onClick={() => toggleSort("campaignStatus")}
                  >
                    Кампания{sortMark("campaignStatus")}
                  </button>
                </th>
                <th>
                  <TermHint term="pacing">
                    <button
                      type="button"
                      onClick={() => toggleSort("pacingPercent")}
                    >
                      Pacing 7д{sortMark("pacingPercent")}
                    </button>
                  </TermHint>
                </th>
                <th>
                  <TermHint term="cpl">
                    <button type="button" onClick={() => toggleSort("cpl7d")}>
                      KPI / CPL{sortMark("cpl7d")}
                    </button>
                  </TermHint>
                </th>
                <th>
                  <button
                    type="button"
                    onClick={() => toggleSort("openRecommendations")}
                  >
                    Рек.{sortMark("openRecommendations")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    onClick={() => toggleSort("unreadAlerts")}
                  >
                    Алерты{sortMark("unreadAlerts")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    onClick={() => toggleSort("lastActionAt")}
                  >
                    Последнее действие{sortMark("lastActionAt")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  data-clickable
                  onClick={() => router.push(`/projects/${row.id}`)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="px-1 text-base leading-none"
                      aria-label={
                        row.favorite
                          ? "Убрать из избранного"
                          : "В избранное"
                      }
                      onClick={() => onToggleFavorite(row.id, !row.favorite)}
                    >
                      {row.favorite ? "★" : "☆"}
                    </button>
                  </td>
                  <td>
                    <Link
                      href={`/projects/${row.id}`}
                      className="font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.name}
                    </Link>
                    <span className="ml-2 align-middle">
                      <StatusBadge value={row.projectStatus} />
                    </span>
                  </td>
                  <td className="text-[var(--fg-muted)]">
                    {row.platforms
                      .map((item) => PLATFORM_LABEL[item] ?? item)
                      .join(", ")}
                  </td>
                  <td>
                    <StatusBadge value={row.campaignStatus} map="campaign" />
                  </td>
                  <td>
                    {row.pacingPercent == null ? (
                      <span className="text-[var(--fg-muted)]">—</span>
                    ) : (
                      <span className="flex flex-col gap-0.5">
                        <Badge kind={pacingKind(row.pacingTone)}>
                          {Math.round(row.pacingPercent)}%
                        </Badge>
                        <span className="text-xs text-[var(--fg-muted)]">
                          {formatMoney(row.spend7d)} /{" "}
                          {formatMoney(
                            row.dailyBudget != null
                              ? row.dailyBudget * 7
                              : null,
                          )}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="text-xs">
                    <p>
                      CPL {row.cpl7d == null ? "—" : formatMoney(row.cpl7d)}
                    </p>
                    <p className="text-[var(--fg-muted)]">
                      конв. {row.conversions7d} / {row.conversions30d} (7/30д)
                    </p>
                  </td>
                  <td>{row.openRecommendations}</td>
                  <td>
                    {row.hasUnreadAlerts ? (
                      <Badge kind="alert">{row.unreadAlerts}</Badge>
                    ) : (
                      <span className="text-[var(--fg-muted)]">0</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-xs text-[var(--fg-muted)]">
                    {formatDate(row.lastActionAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
