import { NextResponse } from 'next/server';
import { generateJwt } from '@coinbase/cdp-sdk/auth';

function buildFallbackUrl(address: string): string {
  const addr = address || '0x0000000000000000000000000000000000000000';
  return `https://pay.coinbase.com/buy/select-asset?addresses=${encodeURIComponent(JSON.stringify({[addr]: ["base"]}))}&assets=${encodeURIComponent(JSON.stringify(["ETH"]))}`;
}

export async function POST(request: Request) {
  let address = '';
  
  try {
    const body = await request.json();
    address = body.address || '';
    
    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    // Get credentials from environment
    let keyId = process.env.CDP_API_KEY_ID;
    const keySecret = process.env.CDP_API_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.log('Missing CDP credentials - CDP_API_KEY_ID:', !!keyId, 'CDP_API_KEY_SECRET:', !!keySecret);
      return NextResponse.json({ 
        fallback: true,
        url: buildFallbackUrl(address)
      });
    }

    // If key ID is just the UUID, convert to full format
    // Full format: organizations/{org_id}/apiKeys/{key_id}
    if (!keyId.startsWith('organizations/')) {
      // Get org ID from environment or use default
      const orgId = process.env.CDP_ORG_ID || '43597d07-27e1-42aa-9d2c-d1825884e5fe';
      keyId = `organizations/${orgId}/apiKeys/${keyId}`;
    }

    console.log('Using key ID:', keyId);
    console.log('Secret length:', keySecret.length);

    // Generate JWT using the official CDP SDK
    const jwt = await generateJwt({
      apiKeyId: keyId,
      apiKeySecret: keySecret,
      requestMethod: 'POST',
      requestHost: 'api.developer.coinbase.com',
      requestPath: '/onramp/v1/token',
      expiresIn: 120
    });

    console.log('JWT generated successfully, length:', jwt.length);

    // Request session token from Coinbase
    const response = await fetch('https://api.developer.coinbase.com/onramp/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        destination_wallets: [{
          address: address,
          blockchains: ['base'],
          assets: ['ETH'],
        }],
      }),
    });

    const responseText = await response.text();
    console.log('CDP API response status:', response.status);
    console.log('CDP API response:', responseText);

    if (!response.ok) {
      console.error('CDP API error:', response.status, responseText);
      return NextResponse.json({ 
        fallback: true,
        url: buildFallbackUrl(address)
      });
    }

    // Parse the response
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse response:', e);
      return NextResponse.json({ 
        fallback: true,
        url: buildFallbackUrl(address)
      });
    }
    
    // Check for token in response (could be at root or nested in data)
    const token = data.token || (data.data && data.data.token);
    
    if (token) {
      console.log('Session token obtained successfully');
      return NextResponse.json({ 
        token: token,
        url: `https://pay.coinbase.com/buy?sessionToken=${token}`
      });
    }

    console.log('No token in response:', JSON.stringify(data));
    return NextResponse.json({ 
      fallback: true,
      url: buildFallbackUrl(address)
    });
    
  } catch (error: any) {
    console.error('Session token error:', error.message);
    console.error('Stack:', error.stack);
    return NextResponse.json({ 
      fallback: true,
      url: buildFallbackUrl(address)
    });
  }
}
