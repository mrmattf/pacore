import type { SlotAdapter, CredentialField } from '../slot-adapter';
import { AfterShipApiClient } from './aftership-api-client';

/**
 * SlotAdapter for AfterShip.
 *
 * Role: 'source' slot — AfterShip sends tracking update webhooks to PA Core.
 * Credential: API key used to validate the connection and optionally enrich tracking data.
 * Capability: 'get_tracking' — looks up tracking status by carrier + tracking number.
 *
 * Note: The delivery-exception chain is primarily webhook-driven.
 * The AfterShip connection is used for credential validation and optional tracking lookups.
 */
export class AfterShipTrackingAdapter implements SlotAdapter {
  readonly integrationKey = 'aftership';
  readonly capabilities = ['get_tracking'] as const;

  readonly credentialFields: CredentialField[] = [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      hint: 'AfterShip Dashboard → API → Generate API Key',
    },
  ];

  readonly setupGuide =
    'AfterShip Dashboard → API → Generate API Key. ' +
    'Then configure a webhook: AfterShip → Notifications → Webhooks → Add Webhook URL → select "Tracking update" events.';

  async testCredentials(creds: Record<string, unknown>): Promise<void> {
    const apiKey = creds.apiKey as string;
    if (!apiKey) {
      throw new Error('AfterShipTrackingAdapter: missing apiKey');
    }
    await this.buildClient(creds).testConnection();
  }

  async invoke(
    capability: string,
    params: Record<string, unknown>,
    creds: Record<string, unknown>
  ): Promise<unknown> {
    if (capability !== 'get_tracking') {
      throw new Error(`AfterShipTrackingAdapter: unsupported capability '${capability}'`);
    }
    return this.buildClient(creds).getTracking(
      params.slug as string,
      params.tracking_number as string
    );
  }

  private buildClient(creds: Record<string, unknown>): AfterShipApiClient {
    const apiKey = creds.apiKey as string;
    if (!apiKey) {
      throw new Error('AfterShipTrackingAdapter: missing apiKey in credentials');
    }
    return new AfterShipApiClient(apiKey);
  }
}
