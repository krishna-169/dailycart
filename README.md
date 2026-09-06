# VEYRO E-Commerce

VEYRO is a print-on-demand apparel storefront built with HTML, JavaScript, and Supabase. Its public frontend contains only the Supabase anon key; privileged fulfillment, payment, and image-storage operations must run server-side.

## Features
- User authentication (login/signup)
- Apparel product listing and search
- Variant-aware cart and wishlist management
- Supplier-aware catalog support for Printify, Meesho affiliate, and manual products
- Profile editing
- Voice search and chatbot
- Supabase-backed order history

## Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/krishna-169/ecommerc.git
   ```
2. Open the project in your code editor.
3. Configure the Supabase URL and anon key in `index.html`.
4. Open `index.html` in your browser to start.

## Database

Run `supabase-setup.sql` in the Supabase SQL editor. It adds POD products and variants, Cloudflare image metadata, variant-aware cart columns, orders, order items, and customer-only RLS policies. Existing marketplace columns are retained for migration compatibility.

## Server-side setup

See `docs/VEYRO-DEPLOYMENT.md` for the required Cloudflare Images or R2 decision, Supabase Edge Function secrets, payment verification flow, Printify fulfillment flow, and upload authorization requirements. Do not put any of those secrets in `index.html`, SQL, local storage, or public environment variables.

## Meesho affiliate mode

Products can use `supplier_type = 'affiliate'`, with an approved `affiliate_url`, `affiliate_network`, `commission_rate`, and optional supplier reference. The product detail page sends customers to Meesho through the affiliate link. Affiliate products must not enter VEYRO payment or fulfillment; do not scrape Meesho or automate purchases with private credentials.

## Files
- `index.html`: Main web application
- `email.js`: Email handling logic
- `supabase-setup.sql`: Supabase database setup

## License
MIT
