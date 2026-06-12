# PRD — FakturIndo (Invoice App for Indonesian Freelancers & UMKM)

## Goal
Mobile-first invoicing tool for Indonesian freelancers and small businesses (UMKM).
Save business profile once, manage clients, build PPN-aware invoices, generate branded PDFs,
share to WhatsApp in Bahasa Indonesia, and track status (Draft / Sent / Paid / Overdue).

## Tech Stack
- Frontend: Expo SDK 54 (React Native, expo-router file-based routing)
- Backend: FastAPI + Motor (MongoDB)
- Auth: Emergent Managed Google OAuth
- PDF: `expo-print` (HTML → PDF locally on device, then `expo-sharing`)
- WhatsApp: `wa.me/<phone>?text=<message>` via `Linking.openURL`

## Core Features
1. **Auth** — Google login (Emergent), persisted Bearer token, auto-restore session on app open.
2. **Business Profile** — name, address, NPWP, phone, email, logo (image picker, base64), signature (image picker, base64), bank info. Used on every invoice + PDF template.
3. **Clients** — CRUD: name, address, phone, email. Stored per user.
4. **Invoices** — multi-line items (description, quantity, rate), optional PPN with editable rate (default 11%), auto subtotal & total, optional notes, status (draft/sent/paid/overdue with auto-overdue based on due date).
5. **Invoice Numbering** — Auto-generated `INV/YYYY/MM/####` via `/api/invoices/next-number`, manually overridable.
6. **PDF Generation** — Branded HTML template w/ logo, signature, NPWP, bank info, items table, PPN line, total. Generated locally via `expo-print`.
7. **WhatsApp Share** — opens `wa.me/<intl phone>?text=<Bahasa Indonesia message>` pre-filled with invoice details (number, dates, total, bank info).
8. **Dashboard Summary** — Total receivable (sent + overdue) and total paid this month.

## API Surface (all `/api/*`)
- `POST /auth/session`, `GET /auth/me`, `POST /auth/logout`
- `GET /business-profile`, `PUT /business-profile`
- `GET|POST /clients`, `PUT|DELETE /clients/{id}`
- `GET /invoices/next-number`
- `GET|POST /invoices`, `GET|PUT|DELETE /invoices/{id}`, `PATCH /invoices/{id}/status`

## Data Models (MongoDB)
- `users` — user_id, email, name, picture, created_at
- `user_sessions` — session_token (unique), user_id, expires_at (TTL)
- `business_profiles` — keyed by user_id (1:1)
- `clients` — id, user_id, name, address, phone, email
- `invoices` — id, user_id, number, client_id, client_snapshot, issue_date, due_date,
  items[], ppn_enabled, ppn_rate, subtotal, ppn_amount, total, status, notes

## Constraints
- IDR currency, format `Rp 1.000.000` (period thousand separator)
- All dates `YYYY-MM-DD` stored, displayed `D MMM YYYY` Bahasa
- No payment integration in MVP
- WhatsApp share works on devices with WA installed (fallback opens browser)

## Next Iterations
- Inline date picker (currently text input)
- Email-based invoice send (Resend/SendGrid)
- Quick duplicate invoice action
- Export invoices as CSV
- In-app online payment link (Stripe / Midtrans / Xendit)
