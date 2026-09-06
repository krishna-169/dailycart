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
  if (!token || !supabaseUrl || !serviceKey) return json({ error: 'Checkout server is not configured.' }, 501);
  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
    const user = await userResponse.json();
    if (!userResponse.ok || !user.id) return json({ error: 'Authentication required.' }, 401);
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [];
    const customer = body.customer || {};
    if (!items.length || !customer.name || !customer.email || !customer.shipping_address || !/^\d{4,10}$/.test(String(customer.postal_code || ''))) {
      return json({ error: 'Complete checkout details are required.' }, 400);
    }
    const productIds = items.map(item => item.product_id).filter(Boolean);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!productIds.length || productIds.some(id => !uuidPattern.test(String(id)))) return json({ error: 'Invalid product selection.' }, 400);
    const productsResponse = await fetch(`${supabaseUrl}/rest/v1/products?id=in.(${productIds.join(',')})&active=eq.true&select=id,name,price,image_url,supplier_type,supplier_product_id`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    const products = await productsResponse.json();
    if (!productsResponse.ok || products.length !== new Set(productIds).size) return json({ error: 'One or more products are unavailable.' }, 400);
    const prices = new Map(products.map(product => [product.id, Number(product.price)]));
    const productNames = new Map(products.map(product => [product.id, product.name]));
    const productImages = new Map(products.map(product => [product.id, product.image_url]));
    const productSuppliers = new Map(products.map(product => [product.id, { type: product.supplier_type || 'printify', id: product.supplier_product_id || null }]));
    const variantIds = items.map(item => item.variant_id).filter(Boolean);
    if (variantIds.some(id => !uuidPattern.test(String(id)))) return json({ error: 'Invalid variant selection.' }, 400);
    const variants = variantIds.length ? await (await fetch(`${supabaseUrl}/rest/v1/product_variants?id=in.(${variantIds.join(',')})&available=eq.true&select=id,product_id,size,color,price,image_url`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } })).json() : [];
    const variantPrices = new Map(variants.map(variant => [variant.id, Number(variant.price)]));
    const variantProducts = new Map(variants.map(variant => [variant.id, variant.product_id]));
    const variantDetails = new Map(variants.map(variant => [variant.id, variant]));
    if (variants.length !== new Set(variantIds).size) return json({ error: 'One or more variants are unavailable.' }, 400);
    const subtotal = items.reduce((sum, item) => {
      const quantity = Math.max(1, Math.min(20, Number(item.quantity) || 0));
      if (item.variant_id && variantProducts.get(item.variant_id) !== item.product_id) throw new Error('Variant does not belong to product.');
      const price = item.variant_id ? variantPrices.get(item.variant_id) : prices.get(item.product_id);
      if (!price || !Number.isFinite(price)) throw new Error('Invalid product price.');
      return sum + price * quantity;
    }, 0);
    const paymentUrl = Deno.env.get('PAYMENT_PROVIDER_CHECKOUT_URL');
    const paymentKey = Deno.env.get('PAYMENT_SECRET_KEY');
    if (!paymentUrl || !paymentKey) return json({ error: 'Payment provider is not configured yet.' }, 501);
    const orderNumber = `VEYRO-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const orderResponse = await fetch(`${supabaseUrl}/rest/v1/orders`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: user.id, order_number: orderNumber, payment_status: 'pending', fulfillment_status: 'pending', subtotal, shipping_amount: 0, total_amount: subtotal, currency: 'INR', customer_name: customer.name, customer_email: customer.email, customer_phone: customer.phone || null, shipping_address: customer.shipping_address, city: customer.city, state: customer.state, postal_code: customer.postal_code, country: customer.country })
    });
    const createdOrders = await orderResponse.json();
    if (!orderResponse.ok || !createdOrders[0]?.id) return json({ error: 'Order could not be created.' }, 502);
    const orderId = createdOrders[0].id;
    const itemResponse = await fetch(`${supabaseUrl}/rest/v1/order_items`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(items.map(item => {
        const variant = item.variant_id ? variantDetails.get(item.variant_id) : null;
        const supplier = productSuppliers.get(item.product_id) || { type: 'manual', id: null };
        return { order_id: orderId, product_id: item.product_id, variant_id: item.variant_id || null, printify_variant_id: item.printify_variant_id || null, supplier_type: supplier.type, supplier_product_id: supplier.id, product_name: productNames.get(item.product_id), size: variant?.size || null, color: variant?.color || null, quantity: Math.max(1, Math.min(20, Number(item.quantity) || 1)), unit_price: item.variant_id ? variantPrices.get(item.variant_id) : prices.get(item.product_id), image_url: variant?.image_url || productImages.get(item.product_id) || null };
      }))
    });
    if (!itemResponse.ok) return json({ error: 'Order items could not be created.' }, 502);
    // Provider-specific order creation belongs here. The provider must return a hosted checkout URL.
    const providerResponse = await fetch(paymentUrl, { method: 'POST', headers: { Authorization: `Bearer ${paymentKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: subtotal, currency: 'INR', customer_email: customer.email, metadata: { user_id: user.id, order_id: orderId, order_number: orderNumber } }) });
    const provider = await providerResponse.json();
    if (!providerResponse.ok || !provider.checkout_url) return json({ error: 'Payment session could not be created.' }, 502);
    return json({ checkout_url: provider.checkout_url, amount: subtotal, order_id: orderId, order_number: orderNumber });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Checkout validation failed.' }, 400);
  }
});
