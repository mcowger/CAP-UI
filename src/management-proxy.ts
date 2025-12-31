/**
 * Management API Proxy Handler
 *
 * Proxies requests to CLIProxy Management API with authentication injection.
 * Handles CORS, security, and error transformation.
 */

export async function proxyManagementRequest(
  req: Request,
  cliproxyUrl: string,
  managementKey: string
): Promise<Response> {
  try {
    // Extract the endpoint path from the request URL
    const url = new URL(req.url);
    const endpoint = url.pathname.replace(/^\/v0\/management\/?/, '');

    // Build target URL
    const targetUrl = `${cliproxyUrl}/v0/management/${endpoint}${url.search}`;

    // Copy headers and inject authentication
    const headers = new Headers(req.headers);
    headers.set('Authorization', `Bearer ${managementKey}`);
    headers.set('X-Management-Key', managementKey);

    // Remove host header (will be set by fetch)
    headers.delete('host');

    // Create proxy request
    const proxyReq = new Request(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD'
        ? await req.arrayBuffer()
        : undefined
    });

    console.log(`[Management Proxy] ${req.method} ${endpoint}`);

    // Forward request
    const response = await fetch(proxyReq);

    // Handle 401 Unauthorized - transform to connection error
    if (response.status === 401) {
      return Response.json(
        {
          error: 'Unauthorized',
          message: 'Invalid management key or connection failed'
        },
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Clone response to preserve body
    const clonedResponse = response.clone();

    // Add CORS headers for frontend access
    const responseHeaders = new Headers(clonedResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Return proxied response with CORS headers
    return new Response(clonedResponse.body, {
      status: clonedResponse.status,
      statusText: clonedResponse.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('[Management Proxy] Error:', error);

    // Handle connection errors
    return Response.json(
      {
        error: 'Proxy Error',
        message: `Failed to connect to CLIProxy: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
