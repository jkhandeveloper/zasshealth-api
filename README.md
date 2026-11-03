# ZassHealth API

NestJS 12, Prisma 6, PostgreSQL 17 and Node.js 24.9+. All routes use `/api`. Includes development hot reload, a non-root production image, SQL migrations, validation, JWT/RBAC, database-backed OTP throttling and PostgreSQL integration tests.

## Quick test with Swagger and demo data

Start the services and load the repeatable development seed:

```sh
docker compose up -d --build
docker compose --profile tools run --rm seed
```

Open **http://localhost:3000/api/docs** (OpenAPI JSON: `/api/docs-json`). For a host-run backend, use `npm run db:seed` after applying migrations.

| Role           | Demo phone    |
| -------------- | ------------- |
| PATIENT        | +923001234561 |
| DOCTOR         | +923001234562 |
| PHARMACIST     | +923001234563 |
| SUPER_ADMIN    | +923001234564 |
| Second PATIENT | +923001234565 |

1. Expand `POST /api/auth/send-otp`, click **Try it out**, and submit a demo phone.
2. Call `POST /api/auth/verify-otp` with the same phone and **123456**.
3. Copy `accessToken`, click **Authorize**, and paste the token only (without `Bearer`). These accounts already exist, so skip register-profile.
4. As PATIENT, list doctors and request tomorrow's slots using doctor ID `20000000-0000-4000-8000-000000000001`. Copy a returned slotTime to book. List your appointments to find the appointmentId for cancellation.
5. Switch to PHARMACIST to list/update the seeded bills or create a bill. Switch to DOCTOR to view the seeded consultation/prescription. Switch to SUPER_ADMIN to test doctor approval.

Seed data includes all four roles, two patients, an approved doctor with daily UTC hours 09:00–17:00 and capacity 2 per 30-minute slot, a past consultation, a cancelled future appointment, two bills, and a synthetic prescription. The seed prints profile IDs and tomorrow's date. It preserves existing fixtures on reruns and refuses conflicting account identities. Demo seeding requires `SEED_DEMO_DATA=true` and is blocked in production. Do not use these identities or synthetic prescriptions for real patient care.

`DEV_FIXED_OTP=123456` is configured in `.env` and `.env.example`. It applies to **every valid phone number** in development, including new registrations. You must still call send-otp first; expiry, failed-attempt limits and single-use verification remain enforced. Set DEV_FIXED_OTP to an empty value to restore random codes. Fixed OTPs are rejected with production mode or a real SMS transport. Production Compose clears this setting, disables Swagger and disables demo seeding. Configure a real SMS transport for production.

## Redis caching

Both Compose files include Redis with a health check. The API uses `REDIS_URL=redis://redis:6379` inside Docker and `redis://localhost:6379` for host development. Development exposes Redis on loopback `${REDIS_PORT:-6379}`; production exposes no Redis host port.

Approved doctor listings are cached for 30 seconds, separately per pagination query. Profile, schedule and approval changes invalidate all list pages across API instances using a new cache generation. Old entries expire automatically. If Redis disconnects or a command fails, requests fall back to PostgreSQL; after an invalidation failure a prior entry may remain visible until its TTL expires. Slots and appointment capacity remain fresh database reads with the existing booking locks. JWTs, OTPs, bills and prescriptions are not cached.

Redis has a 128 MB cache limit with LRU eviction and no persistence because entries are disposable. This reduces repeated doctor-list database queries; no performance benchmark has been run. Clear REDIS_URL to disable caching when running without Docker.

## Start locally

A gitignored `.env` with random development credentials has been created for this workspace. For a fresh checkout, copy `.env.example` to `.env`, replace every `CHANGE_ME` value with independent random secrets and set a URL-safe database password in both POSTGRES_PASSWORD and DATABASE_URL.

```sh
docker compose up --build
```

Compose waits for PostgreSQL health, runs migrations, then starts the API at http://localhost:3000/api. Source changes reload automatically. Database data persists in `postgres_data`. Dependency changes require rebuilding; schema changes require generating the client and creating a migration before rebuilding. Readiness: `GET /api/health`.

Without Docker, start PostgreSQL separately, configure DATABASE_URL, then:

```sh
npm ci
npm run prisma:generate
npm run db:migrate
npm run start:dev
```

## Panels and roles

The four panel audiences are Super Admin (`SUPER_ADMIN`), Patient (`PATIENT`), Doctor (`DOCTOR`), and Pharmacy/Clinic (`PHARMACIST`). Pharmacy and clinic currently share the existing pharmacy billing permissions; clinic-specific workflows are not implemented. This repository provides the backend API, not dashboard UI pages.

The role migration renames existing `ADMIN` accounts to `SUPER_ADMIN` without changing account IDs or deleting data. Run `npm run db:migrate` and `npm run prisma:generate` before starting the updated backend. Coordinate deployment with frontend role checks; new registration requests and token responses use `SUPER_ADMIN`. The existing `ADMIN_INVITE_SECRET` environment key and `adminInviteSecret` request field are retained for configuration compatibility and now provision Super Admin accounts.


If another project uses ports 3000 or 6379, set `PORT=3002`, `REDIS_PORT=6380`, and `REDIS_URL=redis://localhost:6380` in `.env`, then run `docker compose up -d`. Swagger will be at http://localhost:3002/api/docs. Docker services still communicate on their internal ports. PostgreSQL remains on `POSTGRES_PORT` (default 5432); in Navicat use `127.0.0.1`, that port, and the database/user/password from your `.env`.

## Authentication

Phone numbers use E.164, e.g. +923001234567. Send JSON requests.

1. `POST /api/auth/send-otp` with `{"phone":"+923001234567"}`.
2. `POST /api/auth/verify-otp` with `{"phone":"+923001234567","otp":"123456"}`.
3. New users submit the returned opaque registrationToken to `POST /api/auth/register-profile` with `{"registrationToken":"...","role":"PATIENT"}`. PHARMACIST also requires pharmacyName. DOCTOR starts unapproved. SUPER_ADMIN requires adminInviteSecret matching ADMIN_INVITE_SECRET; an empty environment variable disables administrator registration.
4. Use `Authorization: Bearer <accessToken>`. Existing users receive an access token directly from verify-otp. Tokens expire after 15 minutes; repeat OTP login to sign in again. There is no refresh-token endpoint.

Production OTPs are cryptographically generated (development defaults to 123456), stored as keyed hashes, expire in 5 minutes and are single-use. Each challenge permits 5 guesses; resends have a 60-second cooldown. Each IP allows 20 authentication requests per minute across instances. Registration tokens expire after 10 minutes and are consumed atomically. Registration cannot change an existing role. Guards read the current role and verification state from the database. Invalid tokens and unavailable accounts return 401; database lookup failures return 503.

`OTP_TRANSPORT=development` returns developmentOtp in the response; production rejects this transport. For production set OTP_TRANSPORT=webhook, SMS_WEBHOOK_URL to your HTTPS SMS gateway adapter and SMS_WEBHOOK_TOKEN to its bearer secret. The adapter receives `{"phone":"...","message":"..."}`; 2xx means accepted delivery. Failed sends invalidate the challenge and return 503. Never log webhook bodies or tokens. Gateway provisioning and delivery guarantees are external integrations.

## API

| Method | Path                                   | Access / request                                                                                   |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| POST   | /api/auth/send-otp                     | Public; phone                                                                                      |
| POST   | /api/auth/verify-otp                   | Public; phone, otp                                                                                 |
| POST   | /api/auth/register-profile             | Public; registrationToken, role, optional pharmacyName/adminInviteSecret                           |
| POST   | /api/doctors/profile                   | DOCTOR; specialty, fees, slotDuration, maxPatientsPerSlot                                          |
| POST   | /api/doctors/set-availability          | DOCTOR; days array                                                                                 |
| GET    | /api/doctors/list                      | Public; approved doctors                                                                           |
| GET    | /api/doctors/:id/slots?date=YYYY-MM-DD | Public; slots and remainingCapacity                                                                |
| PATCH  | /api/doctors/:id/approval              | SUPER_ADMIN; isApproved                                                                            |
| POST   | /api/appointments/book                 | PATIENT; doctorId, slotTime                                                                        |
| POST   | /api/appointments/cancel               | PATIENT; appointmentId; own appointment                                                            |
| GET    | /api/appointments/list                 | PATIENT or DOCTOR; own appointments                                                                |
| POST   | /api/pharmacist/bills                  | PHARMACIST; patientName, totalAmount, paymentMethod                                                |
| PATCH  | /api/pharmacist/bills/:id/payment      | Owning PHARMACIST; paymentStatus                                                                   |
| PATCH  | /api/pharmacist/bills/:id/delivery     | Owning PHARMACIST; deliveryStatus                                                                  |
| GET    | /api/pharmacist/bills/list             | PHARMACIST; own bills                                                                              |
| POST   | /api/prescriptions                     | Approved DOCTOR with confirmed consultation at or before now; patientId, medicines, optional notes |
| GET    | /api/prescriptions                     | PATIENT or DOCTOR; own prescriptions                                                               |
| GET    | /api/health                            | Public; database readiness                                                                         |

Lists accept offset (default 0) and limit (default 20, maximum 100). Relation IDs are profile UUIDs, not user UUIDs. Appointments expose the patient profile ID for prescriptions. The doctor profile update returns the doctor ID used for approval and booking.

Doctor profile:

```json
{
  "specialty": "Cardiology",
  "fees": 2500,
  "slotDuration": 30,
  "maxPatientsPerSlot": 2
}
```

Availability is a full replacement; omitted days are closed:

```json
{
  "days": [
    { "dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00", "isOpen": true }
  ]
}
```

All schedules use UTC, including dayOfWeek (0=Sunday). Overnight windows are unsupported. Slot timestamps must include Z or an explicit offset. Only complete future slots aligned to opening time are bookable. Clients convert local times to UTC. Slot listings are snapshots; successful booking is the reservation guarantee.

Booking:

```json
{ "doctorId": "<doctor-profile-uuid>", "slotTime": "2030-01-07T09:00:00Z" }
```

Every booking transaction locks the doctor row using parameterized `SELECT FOR UPDATE` before reading the schedule and counting confirmed appointments. PostgreSQL READ COMMITTED gives subsequent statements a fresh snapshot after lock acquisition. Cancellations, approvals and schedule updates use the same lock. Requests serialize per doctor across API instances. Full slots and duplicate bookings return 409. A partial unique index also prevents duplicate active patient/doctor/slot bookings. Cancellation is idempotent and immediately frees capacity; past appointments cannot be cancelled. Schedule/capacity changes require cancelling future bookings first. Fees and specialty remain editable. All writers must maintain this locking protocol; direct database writes can bypass it.

Bills start PENDING for payment and delivery. PaymentMethod is QR or CASH. Payment moves PENDING to PAID; reversal requires a separate refund workflow and is rejected. Delivery moves PENDING to OUT_FOR_DELIVERY to DELIVERED; repeats are idempotent. Amounts use DECIMAL(12,2) and serialize as strings. QR records the payment method; no QR generation or payment processor is integrated. Only the owning pharmacist may mark payment received.

Prescription medicines is a non-empty array of `{"name":"...","dosage":"...","frequency":"...","duration":"..."}`. Prescriptions are scoped to their authoring doctor and patient. Creation locks the doctor row and rechecks approval inside the transaction, serializing it with approval revocation.

## Verification

```sh
npm run build
npm test -- --runInBand
npx prisma validate
```

Integration tests require an isolated PostgreSQL database. Set DATABASE_URL to it, run `npm run db:migrate`, set TEST_DATABASE_URL to the same URL, then run `npm run test:integration`. Tests create uniquely identified records and clean their own fixtures. They cover concurrent booking capacity, cancellation, duplicate booking, invalid slots, schedule conflicts, ownership, role guards, OTP attempt persistence and replay, prescription consultation checks and ownership, and concurrent doctor approval revocation. GitHub Actions supplies PostgreSQL and runs all checks. Unit tests do not prove database concurrency correctness.

Dependency overrides select patched multer, effect and deepmerge-ts releases. Review them when upgrading NestJS or Prisma. Prisma CLI/client versions are pinned together.

## Production operations

Configure a real SMS adapter (OTP_TRANSPORT=webhook), production secrets and CORS_ORIGINS, then:

```sh
docker compose -f docker-compose.prod.yml up -d --build
```

This standalone configuration has no source bind mounts, keeps PostgreSQL private, binds the API to loopback for a TLS proxy, runs the API as non-root with a read-only filesystem, and migrates before startup. Disable or rotate ADMIN_INVITE_SECRET after provisioning admins. Use a secrets manager. Migrations run separately from the application.

Before handling real patient data, configure TLS, encrypted backups with restore drills, database access controls, monitoring and healthcare-specific retention/access-audit policies. Compliance and infrastructure operation remain deployment responsibilities. No clinical payloads are intentionally logged. Refunds, identity proofing, pharmacist licensing, payment settlement and SMS provisioning need deployment-specific integrations.

The app does not trust forwarded IP headers. Behind a proxy, configure Express trust proxy for exact trusted proxy addresses before enabling per-client throttling; otherwise requests share the proxy bucket. Also enforce edge rate limits. Schedule `npm run db:cleanup` daily in a maintenance container to delete expired throttle buckets and OTP challenges older than 24 hours. Monitor SMS failures and database saturation.

References: [Prisma transactions](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions), [NestJS validation](https://docs.nestjs.com/techniques/validation).
