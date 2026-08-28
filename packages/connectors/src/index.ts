export {
  NotImplementedError,
  PlatformApiError,
  isPlatformRateLimitError,
  assertStageNotReached,
} from "./types";
export { tokenNeedsRefresh, DEFAULT_TOKEN_REFRESH_SKEW_MS } from "./oauth-refresh";
export {
  ProjectApiLimiter,
  defaultProjectApiLimiter,
  DEFAULT_PROJECT_API_MIN_INTERVAL_MS,
  DEFAULT_PROJECT_API_MAX_BACKOFF_MS,
} from "./project-rate-limit";
export type {
  AdPlatformConnector,
  Credentials,
  KeywordIdea,
  OAuthUrl,
  PerformanceDateRange,
  PerformanceSnapshot,
  PlatformAuth,
  SearchTermSnapshot,
} from "./types";

export {
  MockKeywordIdeasProvider,
} from "./keyword-ideas";
export type { KeywordIdeasProvider } from "./keyword-ideas";

export {
  YandexDirectConnector,
  createYandexOAuthClient,
  createMockYandexOAuthClient,
} from "./yandex-direct.connector";
export type {
  YandexOAuthClient,
  YandexOAuthConfig,
  YandexTokenResponse,
} from "./yandex-direct.connector";

export {
  LiveYandexDirectApi,
  MockYandexDirectApi,
  humanizeDirectError,
  parsePerformanceTsv,
} from "./yandex-direct.api";
export type { YandexDirectApi, YandexAuth } from "./yandex-direct.api";
export { toYandexMoney, yandexRegionIds } from "./yandex-geo";

export {
  GoogleAdsConnector,
  createGoogleOAuthClient,
  GOOGLE_ADS_SCOPE,
} from "./google-ads.connector";
export type {
  GoogleOAuthClient,
  GoogleOAuthConfig,
  GoogleTokenResponse,
} from "./google-ads.connector";
export {
  LiveGoogleAdsApi,
  MockGoogleAdsApi,
  humanizeGoogleError,
} from "./google-ads.api";
export type { GoogleAdsApi, GoogleAdsAuth } from "./google-ads.api";

export {
  MockAttributionApi,
  LiveBitrix24Api,
  LiveAmoCrmApi,
  LiveCalltouchApi,
  LiveRoistatApi,
  createAttributionConnector,
  hashPhone,
  parseInboundPayload,
  redactSecret,
} from "./attribution";
export type {
  AttributionApi,
  AttributionAuth,
  AttributionConnector,
  AttributionProviderName,
  ConversionRecord,
} from "./attribution";

export {
  MediaGenerationConnector,
  MockMediaGenerationApi,
  LiveOpenAiImageApi,
  createMediaGenerationApi,
  redactMediaSecret,
  MOCK_PNG,
} from "./media";
export type {
  GeneratedMedia,
  GenerateImageInput,
  GenerateVideoInput,
  MediaGenerationApi,
  MediaKind as ConnectorMediaKind,
} from "./media";
