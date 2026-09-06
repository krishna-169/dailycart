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

  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !supabaseUrl || !serviceKey) return json({ error: 'COD service is not configured.' }, 501);

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
    });
    const user = await userResponse.json();
    if (!userResponse.ok || !user.id) return json({ error: 'Authentication required.' }, 401);

    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const customer = body.customer || {};
    if (!items.length || !customer.name || !customer.email || !customer.phone || !customer.shipping_address || !customer.city || !customer.state || !customer.country || !/^\d{4,10}$/.test(String(customer.postal_code || ''))) {
      return json({ error: 'Complete shipping details are required.' }, 400);
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const productIds = [...new Set(items.map(item => item.product_id).filter(Boolean))];
    if (!productIds.length || productIds.some(id => !uuidPattern.test(String(id)))) return json({ error: 'Invalid product selection.' }, 400);

    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const productsResponse = await fetch(`${supabaseUrl}/rest/v1/products?id=in.(${productIds.join(',')})&active=eq.true&select=id,name,price,image_url,supplier_type,supplier_product_id`, { headers });
    const products = await productsResponse.json();
    if (!productsResponse.ok || products.length !== productIds.length) return json({ error: 'One or more products are unavailable.' }, 400);

    const productMap = new Map(products.map(product => [product.id, product]));
    const variantIds = [...new Set(items.map(item => item.variant_id).filter(Boolean))];
    if (variantIds.some(id => !uuidPattern.test(String(id)))) return json({ error: 'Invalid variant selection.' }, 400);
    const variantsResponse = variantIds.length
      ? await fetch(`${supabaseUrl}/rest/v1/product_variants?id=in.(${variantIds.join(',')})&available=eq.true&select=id,product_id,size,color,price,image_url`, { headers })
      : null;
    const variants = variantsResponse ? await variantsResponse.json() : [];
    if (variantsResponse && (!variantsResponse.ok || variants.length !== variantIds.length)) return json({ error: 'One or more variants are unavailable.' }, 400);
    const variantMap = new Map(variants.map(variant => [variant.id, variant]));

    const orderLines = items.map(item => {
      const product = productMap.get(item.product_id);
      const variant = item.variant_id ? variantMap.get(item.variant_id) : null;
      if (!product || (variant && variant.product_id !== product.id)) throw new Error('Invalid product variant.');
      const quantity = Math.max(1, Math.min(20, Number(item.quantity) || 0));
      const unitPrice = Number(variant?.price ?? product.price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error('Invalid product price.');
      return { item, product, variant, quantity, unitPrice };
    });
    const subtotal = orderLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const orderNumber = `VEYRO-COD-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    const orderResponse = await fetch(`${supabaseUrl}/rest/v1/orders`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: user.id, order_number: orderNumber, payment_status: 'cod_pending', fulfillment_status: 'pending', subtotal, shipping_amount: 0, total_amount: subtotal, currency: 'INR', customer_name: customer.name, customer_email: customer.email, customer_phone: customer.phone, shipping_address: customer.shipping_address, city: customer.city, state: customer.state, postal_code: customer.postal_code, country: customer.country })
    });
    const orders = await orderResponse.json();
    if (!orderResponse.ok || !orders[0]?.id) return json({ error: 'COD order could not be created.' }, 502);

    const itemResponse = await fetch(`${supabaseUrl}/rest/v1/order_items`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(orderLines.map(line => ({ order_id: orders[0].id, product_id: line.product.id, variant_id: line.variant?.id || null, printify_variant_id: line.item.printify_variant_id || null, supplier_type: line.product.supplier_type || 'printify', supplier_product_id: line.product.supplier_product_id || null, product_name: line.product.name, size: line.variant?.size || line.product.size || null, color: line.variant?.color || line.product.color || null, quantity: line.quantity, unit_price: line.unitPrice, image_url: line.variant?.image_url || line.product.image_url || null })))
    });
    if (!itemResponse.ok) return json({ error: 'COD order items could not be created.' }, 502);
    return json({ order_id: orders[0].id, order_number: orderNumber }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'COD order failed.' }, 400);
  }
});
