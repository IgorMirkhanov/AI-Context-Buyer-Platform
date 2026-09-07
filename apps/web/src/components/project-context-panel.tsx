"use client";

import { cabinetCampaignUrl, platformTitle } from "@/lib/ad-platform-links";
import type { CampaignRef } from "@/lib/project-campaign-refs";
import { Badge } from "@/ui/badge";

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function ProjectContextPanel({
  websiteUrl,
  platform,
  connected,
  needsReconnect = false,
  campaignRefs,
  compact = false,
}: {
  websiteUrl: string | null;
  platform: string;
  connected: boolean;
  needsReconnect?: boolean;
  campaignRefs: CampaignRef[];
  compact?: boolean;
}) {
  const cabinet = platformTitle(platform);
  const href = websiteUrl ? normalizeUrl(websiteUrl) : null;

  return (
    <div
      className={`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-muted)] ${
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"
      }`}
    >
      <p className={`font-medium ${compact ? "mb-1" : "mb-2"}`}>
        Контекст проекта
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-[var(--fg-muted)]">Проанализированный сайт</dt>
          <dd className="mt-0.5 break-all">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--fg)] underline-offset-2 hover:underline"
              >
                {websiteUrl}
              </a>
            ) : (
              <span className="text-[var(--fg-muted)]">
                Укажите URL в брифе — без него анализ не запустится
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--fg-muted)]">Рекламный кабинет</dt>
          <dd className="mt-0.5">
            {needsReconnect ? (
              <span className="text-[var(--status-danger-fg)]">
                {cabinet} · требуется переподключение
              </span>
            ) : connected ? (
              <span>{cabinet} · подключён</span>
            ) : (
              <span className="text-[var(--fg-muted)]">
                {cabinet} · не подключён (публикация недоступна)
              </span>
            )}
          </dd>
        </div>
      </dl>

      {campaignRefs.length > 0 ? (
        <div className={compact ? "mt-2" : "mt-3"}>
          <p className="mb-1 text-[var(--fg-muted)]">
            Соответствие названий и кампаний в {cabinet}
          </p>
          <ul className="flex flex-col gap-2">
            {campaignRefs.map((ref) => {
              const cabinetUrl =
                ref.externalCampaignId != null
                  ? cabinetCampaignUrl(platform, ref.externalCampaignId)
                  : null;
              return (
                <li
                  key={`${ref.internalName}-${ref.externalCampaignId ?? "draft"}`}
                  className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{ref.internalName}</span>
                    {ref.source === "planned" ? (
                      <Badge kind="review">план</Badge>
                    ) : ref.published ? (
                      <Badge kind="success">в кабинете</Badge>
                    ) : (
                      <Badge kind="draft">черновик</Badge>
                    )}
                    {ref.status === "archived" ? (
                      <Badge kind="draft">архив</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    {ref.published && ref.externalCampaignId ? (
                      <>
                        ID в {cabinet}:{" "}
                        {cabinetUrl ? (
                          <a
                            href={cabinetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono font-medium text-[var(--fg)] underline-offset-2 hover:underline"
                          >
                            №{ref.externalCampaignId}
                          </a>
                        ) : (
                          <span className="font-mono font-medium">
                            №{ref.externalCampaignId}
                          </span>
                        )}
                        {ref.status ? ` · ${ref.status}` : ""}
                      </>
                    ) : connected ? (
                      <>
                        В {cabinet} будет создана с этим названием. Номер
                        кампании (ID) появится здесь сразу после публикации на
                        вкладке «Кампания».
                      </>
                    ) : (
                      <>
                        После подключения {cabinet} и публикации здесь появится
                        номер кампании в кабинете.
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className={`text-xs text-[var(--fg-muted)] ${compact ? "mt-2" : "mt-3"}`}>
          Название кампании в {cabinet} появится после сборки черновика на вкладке
          «Кампания» или в плане структуры на вкладке «План».
        </p>
      )}
    </div>
  );
}
