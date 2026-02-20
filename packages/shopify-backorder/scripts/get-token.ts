/**
 * Get Shopify Admin API Access Token using Client Credentials Grant
 *
 * Usage:
 *   npx tsx scripts/get-token.ts <store-domain> <client-id> <client-secret>
 *
 * Example:
 *   npx tsx scripts/get-token.ts my-store.myshopify.com abc123 secret456
 */

const [storeDomain, clientId, clientSecret] = process.argv.slice(2);

if (!storeDomain || !clientId || !clientSecret) {
  console.error('Usage: npx tsx scripts/get-token.ts <store-domain> <client-id> <client-secret>');
  console.error('Example: npx tsx scripts/get-token.ts my-store.myshopify.com abc123 secret456');
  process.exit(1);
}

async function getAccessToken() {
  const tokenUrl = `https://${storeDomain}/admin/oauth/access_token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to get token:', response.status, error);
    process.exit(1);
  }

  const data = await response.json();

  console.log('\n✓ Access Token Retrieved!\n');
  console.log('Add this to your .env file:');
  console.log(`SHOPIFY_ACCESS_TOKEN=${data.access_token}\n`);
}

getAccessToken().catch(console.error);
