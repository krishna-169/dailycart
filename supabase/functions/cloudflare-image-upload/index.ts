const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function requireAdmin(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const adminIds = (Deno.env.get('VEYRO_ADMIN_USER_IDS') || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!token || !serviceKey || !supabaseUrl) throw new Error('Server authentication is not configured.');
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
  });
  const user = await response.json();
  if (!response.ok || !adminIds.includes(user.id)) throw new Error('Admin authorization required.');
  return user;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    await requireAdmin(request);
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = Deno.env.get('CLOUDFLARE_IMAGES_TOKEN');
    if (!accountId || !token) return json({ error: 'Cloudflare Images is not configured.' }, 501);
    const body = await request.json();
    const contentType = String(body.content_type || '');
    const size = Number(body.size || 0);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return json({ error: 'Unsupported image type.' }, 400);
    if (!Number.isFinite(size) || size <= 0 || size > 10 * 1024 * 1024) return json({ error: 'Image must be smaller than 10 MB.' }, 400);
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json();
    if (!response.ok || !result.success) return json({ error: 'Cloudflare upload URL could not be created.' }, 502);
    return json({ id: result.result.id, upload_url: result.result.uploadURL });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Upload authorization failed.' }, 403);
  }
});
