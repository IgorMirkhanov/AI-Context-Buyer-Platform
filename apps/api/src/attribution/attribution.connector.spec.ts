import {
  createAttributionConnector,
  hashPhone,
  MockAttributionApi,
  parseInboundPayload,
  redactSecret,
} from '@context-buyer/connectors';

describe('AttributionConnector', () => {
  const api = new MockAttributionApi('bitrix24');
  const connector = createAttributionConnector('bitrix24', api);
  const auth = { accessToken: 'https://example.bitrix24.ru/rest/1/secret-token' };

  it('returns mock leads bound to the requested project and hashes phones', async () => {
    const rows = await connector.listConversions(
      'project-1',
      { from: '2026-08-20', to: '2026-08-26' },
      auth,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].phoneHash).toBe(hashPhone('79001234567'));
    expect(rows[0].phoneHash).not.toContain('7900');
    expect(rows[0].utmCampaign).toBe('555');
    expect(JSON.stringify(rows)).not.toContain('secret-token');
  });

  it('requires projectId', async () => {
    await expect(
      connector.listConversions('', { from: '2026-08-20', to: '2026-08-26' }, auth),
    ).rejects.toThrow(/projectId/);
  });

  it('parses a Bitrix inbound payload without keeping the raw phone', () => {
    const rows = parseInboundPayload('bitrix24', {
      fields: {
        ID: '77',
        TITLE: 'Заявка',
        DATE_CREATE: '2026-08-26T10:00:00+03:00',
        UTM_CAMPAIGN: '555',
        PHONE: [{ VALUE: '+7 (900) 123-45-67' }],
      },
    });
    expect(rows[0].externalId).toBe('77');
    expect(rows[0].phoneHash).toBe(hashPhone('79001234567'));
    expect(JSON.stringify(rows)).not.toContain('123-45');
  });

  it('parses Calltouch inbound as a call', () => {
    const rows = parseInboundPayload('calltouch', {
      callId: 'c-9',
      utm_campaign: '555',
      phone: '79001112233',
    });
    expect(rows[0].type).toBe('call');
    expect(rows[0].utmCampaign).toBe('555');
  });

  it('redacts Bitrix webhook tokens in error text', () => {
    const raw = 'failed https://portal.bitrix24.ru/rest/1/abcdtoken/crm.lead.list';
    expect(redactSecret(raw)).not.toContain('abcdtoken');
  });
});
