# VEYRO Deployment Notes

## Cloudflare image storage

Choose one provider in the Cloudflare dashboard before implementing the upload Edge Function:

- Cloudflare Images: use this when product image transformations and delivery variants are the priority.
- Cloudflare R2: use this when original objects and flexible object-storage access are required.

Do not invent account IDs, image IDs, bucket names, or tokens. Configure the selected service, then add only server-side secrets to Supabase Edge Functions. The browser should receive a signed upload URL or a short-lived direct-upload token, never a Cloudflare API token.

Required server-side validation:

- Accept only approved image MIME types.
- Enforce a maximum byte size before upload.
- Require an authenticated admin role for catalog uploads.
- Save the returned stable image URL and provider ID in `products.image_url`, `product_images.image_url`, and `product_images.cloudflare_image_id`.
- Keep the old image until the replacement has uploaded and its database update succeeds.

## Supabase Edge Function secrets

Set these through the Supabase dashboard or CLI secret manager, not in source files:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_IMAGES_TOKEN` or the R2 access credentials required by the selected service
- `PRINTIFY_API_TOKEN`
- `PAYMENT_SECRET_KEY`
- `PAYMENT_WEBHOOK_SECRET`
- `PRINTIFY_WEBHOOK_SECRET`
- `PAYMENT_PROVIDER_CHECKOUT_URL`
- `PRINTIFY_SHOP_ID`
- `VEYRO_ADMIN_USER_IDS` (comma-separated Supabase auth user IDs)

The exact payment provider and Cloudflare product remain configurable until real credentials are supplied.

## Temporary cash on delivery

Until an online payment provider is configured, deploy `create-cod-order`. The checkout exposes only Cash on Delivery and creates orders with `payment_status = 'cod_pending'`. Do not treat these orders as paid; confirm collection and update the order status through an authorized operations workflow.

Deploy the functions from the repository root with the Supabase CLI after linking the intended project:

```text
supabase functions deploy cloudflare-image-upload
supabase functions deploy create-payment-order
supabase functions deploy printify-fulfillment
```

Set the secrets with `supabase secrets set`; never commit the values. The payment function currently expects the configured provider endpoint to return a hosted `checkout_url`. Adapt that small provider-specific request to the selected payment provider before production use.

## Secure order flow

1. The client submits checkout details and cart line IDs to a payment Edge Function.
2. The function reloads product and variant prices from Supabase, validates availability and quantities, and creates a pending payment with an idempotency key.
3. A verified payment webhook marks exactly one internal order as paid.
4. A server-side Printify Edge Function creates exactly one Printify order, stores its ID, and updates fulfillment status.
5. Printify webhook events update fulfillment and tracking fields. Missing tracking data must remain pending rather than being fabricated.

RLS should allow customers to select only their own orders and order items. Inserts and fulfillment updates belong to trusted Edge Functions.

## Meesho affiliate mode

Set a product's `supplier_type` to `affiliate` and store its approved tracking link in `affiliate_url`. Optional fields include `affiliate_network`, `commission_rate`, and `supplier_product_id`. The product detail CTA sends customers to Meesho, and affiliate products are blocked from VEYRO checkout because the purchase occurs on Meesho. Do not scrape product pages or automate purchases using private browser credentials.
