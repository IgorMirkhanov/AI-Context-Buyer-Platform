import { Injectable } from '@nestjs/common';
import { AdPlatform } from '@prisma/client';
import {
  GoogleAdsConnector,
  YandexDirectConnector,
} from '@context-buyer/connectors';

@Injectable()
export class ConnectorRouter {
  constructor(
    private readonly yandex: YandexDirectConnector,
    private readonly google: GoogleAdsConnector,
  ) {}

  forPlatform(platform: AdPlatform) {
    return platform === AdPlatform.google_ads ? this.google : this.yandex;
  }
}
