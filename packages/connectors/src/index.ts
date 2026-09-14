export {
  NotImplementedError,
  PlatformApiError,
  isPlatformRateLimitError,
  isConnectionVerificationError,
  connectionVerificationMessage,
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
  AccountCampaignSummary,
  AccountCampaignStatus,
  ConnectionVerificationResult,
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
  LiveGoogleKeywordIdeasProvider,
  seedHasCommercialModifier,
} from "./keyword-ideas";
export type { KeywordIdeasProvider } from "./keyword-ideas";

export {
  YandexDirectConnector,
  YANDEX_DEFAULT_OAUTH_SCOPE,
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
  mapYandexCampaignState,
  parsePerformanceTsv,
} from "./yandex-direct.api";
export type { YandexDirectApi, YandexAuth, YandexAccountCampaignRow } from "./yandex-direct.api";
export { toYandexMoney, yandexRegionIds } from "./yandex-geo";

export {
  GoogleAdsConnector,
  createGoogleOAuthClient,
  createMockGoogleOAuthClient,
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
  isGoogleAdsAccessLevelError,
  formatGoogleAdsError,
  sanitizeNegativeKeywords,
  mapGenerateKeywordIdeaResult,
  GOOGLE_ADS_API_VERSION,
} from "./google-ads.api";
export type { GoogleAdsApi, GoogleAdsAuth } from "./google-ads.api";
export {
  googleGeoTargetConstants,
  googleLanguageForGeo,
  GOOGLE_GEO_TARGET_IDS,
} from "./google-geo";

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
