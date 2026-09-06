const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const printifyToken = Deno.env.get('PRINTIFY_API_TOKEN');
  const shopId = Deno.env.get('PRINTIFY_SHOP_ID');
  if (!printifyToken || !shopId) return json({ error: 'Printify fulfillment is not configured.' }, 501);
  const body = await request.json();
  if (!body.order_id || !body.customer || !Array.isArray(body.items) || !body.items.length) return json({ error: 'A paid order and validated items are required.' }, 400);
  // This endpoint must be called only by a verified payment webhook or trusted service role.
  if (request.headers.get('X-Verified-Payment') !== 'true') return json({ error: 'Verified payment is required.' }, 403);
  // Keep this call idempotent by checking orders.printify_order_id before creating a Printify order.
  return json({ error: 'Implement the configured Printify order payload and webhook mapping before enabling fulfillment.' }, 501);
});
