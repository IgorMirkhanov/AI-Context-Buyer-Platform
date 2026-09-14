import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createAttributionConnector,
  createGoogleOAuthClient,
  createMockGoogleOAuthClient,
  createMediaGenerationApi,
  createMockYandexOAuthClient,
  createYandexOAuthClient,
  GoogleAdsConnector,
  LiveAmoCrmApi,
  LiveBitrix24Api,
  LiveCalltouchApi,
  LiveGoogleAdsApi,
  LiveRoistatApi,
  LiveYandexDirectApi,
  MediaGenerationConnector,
  MockAttributionApi,
  MockGoogleAdsApi,
  MockKeywordIdeasProvider,
  LiveGoogleKeywordIdeasProvider,
  MockYandexDirectApi,
  YANDEX_DEFAULT_OAUTH_SCOPE,
  YandexDirectConnector,
} from '@context-buyer/connectors';
import type { AttributionApi, AttributionProviderName } from '@context-buyer/connectors';
import { ConnectorRouter } from './connector-router';
import { AttributionRouter } from './attribution-router';
import { PlatformConnectionService } from './platform-connection.service';

@Module({
  providers: [
    {
      provide: YandexDirectConnector,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const mock =
          config.get<string>('YANDEX_DIRECT_MOCK') === '1' ||
          config.get<string>('YANDEX_DIRECT_MOCK') === 'true';
        const oauthConfig = {
          clientId: config.get<string>('YANDEX_CLIENT_ID') ?? '',
          clientSecret: config.get<string>('YANDEX_CLIENT_SECRET') ?? '',
          redirectUri:
            config.get<string>('YANDEX_REDIRECT_URI') ??
            'http://localhost:3001/oauth/yandex/callback',
          scope:
            config.get<string>('YANDEX_OAUTH_SCOPE')?.trim() ||
            YANDEX_DEFAULT_OAUTH_SCOPE,
          mock,
        };
        const api = mock
          ? new MockYandexDirectApi()
          : new LiveYandexDirectApi(
              config.get<string>('YANDEX_DIRECT_API_URL') ??
                'https://api.direct.yandex.com/json/v5',
            );
        return new YandexDirectConnector(
          oauthConfig,
          mock
            ? createMockYandexOAuthClient()
            : createYandexOAuthClient(oauthConfig),
          new MockKeywordIdeasProvider(),
          api,
        );
      },
    },
    {
      provide: GoogleAdsConnector,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const mock =
          config.get<string>('GOOGLE_ADS_MOCK') === '1' ||
          config.get<string>('GOOGLE_ADS_MOCK') === 'true';
        const oauthConfig = {
          clientId: config.get<string>('GOOGLE_ADS_CLIENT_ID') ?? '',
          clientSecret: config.get<string>('GOOGLE_ADS_CLIENT_SECRET') ?? '',
          redirectUri:
            config.get<string>('GOOGLE_ADS_REDIRECT_URI') ??
            'http://localhost:3001/oauth/google-ads/callback',
          developerToken: config.get<string>('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '',
          loginCustomerId:
            config.get<string>('GOOGLE_ADS_LOGIN_CUSTOMER_ID') || undefined,
          mock,
        };
        if (
          !mock &&
          (!oauthConfig.clientId.trim() ||
            !oauthConfig.clientSecret.trim() ||
            !oauthConfig.developerToken.trim())
        ) {
          // Soft signal at boot; connect endpoint still fails closed via ProjectsService.
          // eslint-disable-next-line no-console
          console.warn(
            '[GoogleAds] GOOGLE_ADS_MOCK is off but CLIENT_ID / CLIENT_SECRET / DEVELOPER_TOKEN are incomplete',
          );
        }
        const api = mock
          ? new MockGoogleAdsApi()
          : new LiveGoogleAdsApi(
              oauthConfig.developerToken,
              oauthConfig.loginCustomerId,
            );
        const keywordIdeas = mock
          ? new MockKeywordIdeasProvider()
          : new LiveGoogleKeywordIdeasProvider(api);
        return new GoogleAdsConnector(
          oauthConfig,
          mock
            ? createMockGoogleOAuthClient(oauthConfig)
            : createGoogleOAuthClient(oauthConfig),
          keywordIdeas,
          api,
        );
      },
    },
    ConnectorRouter,
    PlatformConnectionService,
    {
      provide: AttributionRouter,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const mock =
          config.get<string>('ATTRIBUTION_MOCK') === '1' ||
          config.get<string>('ATTRIBUTION_MOCK') === 'true';
        const make = (provider: AttributionProviderName) => {
          const api = mock
            ? new MockAttributionApi(provider)
            : liveAttributionApi(provider);
          return createAttributionConnector(provider, api);
        };
        return new AttributionRouter({
          bitrix24: make('bitrix24'),
          amocrm: make('amocrm'),
          calltouch: make('calltouch'),
          roistat: make('roistat'),
        });
      },
    },
    {
      provide: MediaGenerationConnector,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const mock =
          config.get<string>('MEDIA_MOCK') === '1' ||
          config.get<string>('MEDIA_MOCK') === 'true';
        const api = createMediaGenerationApi({
          mock,
          apiKey: undefined,
          model: config.get<string>('MEDIA_IMAGE_MODEL') || 'dall-e-3',
        });
        return new MediaGenerationConnector(api);
      },
    },
  ],
  exports: [
    YandexDirectConnector,
    GoogleAdsConnector,
    ConnectorRouter,
    PlatformConnectionService,
    AttributionRouter,
    MediaGenerationConnector,
  ],
})
export class ConnectorsModule {}

function liveAttributionApi(provider: AttributionProviderName): AttributionApi {
  if (provider === 'bitrix24') return new LiveBitrix24Api();
  if (provider === 'amocrm') return new LiveAmoCrmApi();
  if (provider === 'calltouch') return new LiveCalltouchApi();
  return new LiveRoistatApi();
}
