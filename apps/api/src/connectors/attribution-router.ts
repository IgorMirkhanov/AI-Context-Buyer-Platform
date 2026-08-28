import {
  AttributionConnector,
  AttributionProviderName,
} from "@context-buyer/connectors";

export class AttributionRouter {
  constructor(
    private readonly connectors: Record<
      AttributionProviderName,
      AttributionConnector
    >,
  ) {}

  forProvider(provider: AttributionProviderName): AttributionConnector {
    const connector = this.connectors[provider];
    if (!connector) {
      throw new Error(`Unknown attribution provider: ${provider}`);
    }
    return connector;
  }
}
