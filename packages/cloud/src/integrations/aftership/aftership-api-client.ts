const AFTERSHIP_BASE_URL = 'https://api.aftership.com/v4';

export interface AfterShipTracking {
  id: string;
  tracking_number: string;
  slug: string;
  tag: string;
  subtag: string;
  subtag_message: string;
  order_id: string;
  order_number: string;
  latest_estimated_delivery: string | null;
}

/**
 * Thin AfterShip API v4 client.
 * Used primarily for credential validation (testConnection) and optional tracking lookups.
 * The delivery-exception chain relies on inbound webhooks, not polling.
 */
export class AfterShipApiClient {
  constructor(private readonly apiKey: string) {}

  /**
   * Validates the API key by calling the trackings endpoint.
   * Throws with a user-readable message if credentials are invalid.
   */
  async testConnection(): Promise<void> {
    const response = await fetch(`${AFTERSHIP_BASE_URL}/trackings?limit=1`, {
      headers: {
        'aftership-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid AfterShip API key — check your credentials');
    }

    if (!response.ok) {
      throw new Error(`AfterShip API connection failed (${response.status})`);
    }
  }

  /**
   * Looks up a single tracking by carrier slug + tracking number.
   * Returns null if the tracking is not found.
   */
  async getTracking(slug: string, trackingNumber: string): Promise<AfterShipTracking | null> {
    const response = await fetch(
      `${AFTERSHIP_BASE_URL}/trackings/${encodeURIComponent(slug)}/${encodeURIComponent(trackingNumber)}`,
      {
        headers: {
          'aftership-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 404) return null;

    if (!response.ok) {
      throw new Error(`AfterShip getTracking failed (${response.status})`);
    }

    const data = await response.json() as {
      data: { tracking: AfterShipTracking };
    };
    return data.data.tracking;
  }
}
