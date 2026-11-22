# AVRO Central Admin & License Control Engine

Commercial license management, HMAC cryptographical entitlement signing, subscription billing, and multi-tenant fleet control engine for AVRO E-Commerce Platform.

## 🚀 Deployment (Vercel)

1. Connect this repository to Vercel.
2. In **Project Settings ➔ Environment Variables**, add:
   - `DATABASE_URL` (Supabase transaction pooler port 6543 with `schema=central`)
   - `DIRECT_URL` (Supabase direct connection port 5432 with `schema=central`)
   - `JWT_SECRET`
   - `LICENSE_HMAC_SECRET`
   - `NEXT_PUBLIC_APP_URL`
3. Set Build Command:
   ```bash
   npm run build
   ```

## 🔐 Default Master Admin Login
- **URL:** `/login`
- **Email:** `admin@technext.co`
- **Password:** `admin123`

## 🔌 Connecting Storefronts to this Central Admin
In each Storefront installation `.env`:
```env
CENTRAL_API_URL="https://your-central-admin.vercel.app/api/v1"
```
