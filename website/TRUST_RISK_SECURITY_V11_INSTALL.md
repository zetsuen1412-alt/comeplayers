# ComePlayers V11 — Trust, Risk & Account Security

V11 adds a real withdrawal PIN, authenticator MFA support, device tracking, payout cooldowns, KYC-based withdrawal limits, risk scoring, and an admin risk queue.

## 1. Backup

```powershell
git add .
git commit -m "backup before trust risk security v11"
```

## 2. Environment variables

Generate two different secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Add them to `.env.local` and Vercel:

```env
WITHDRAWAL_PIN_PEPPER=FIRST_SECRET
SECURITY_HASH_SECRET=SECOND_SECRET
PAYOUT_SECURITY_COOLDOWN_HOURS=0
WITHDRAWAL_MIN_KYC_LEVEL=0
```

Use `0` cooldown and KYC level during local testing. Recommended production values:

```env
PAYOUT_SECURITY_COOLDOWN_HOURS=24
WITHDRAWAL_MIN_KYC_LEVEL=1
```

Never change `WITHDRAWAL_PIN_PEPPER` after users create withdrawal PINs. Existing PINs would stop validating.

## 3. Database migration

Open:

```text
scripts/comeplayers_trust_risk_security_v11.sql
```

Copy the entire SQL content into Supabase SQL Editor and run it.

Expected result:

```text
comeplayers_trust_risk_security_v11_ready
```

## 4. Validate

```powershell
npm run typecheck
npm run lint
npm run build
npm run dev
```

## 5. Test user security

Open:

```text
/account/security
```

1. Register the current device.
2. Create a non-trivial 6-digit withdrawal PIN.
3. Optionally enroll authenticator MFA.
4. Mark the current device trusted.
5. Check KYC level, payout cooldown, risk status, and security event history.

## 6. Test payout security

Open:

```text
/seller/payouts
```

1. Add a payout account.
2. Wait for the cooldown or use `PAYOUT_SECURITY_COOLDOWN_HOURS=0` locally.
3. Enter the withdrawal PIN.
4. Submit a small withdrawal.
5. Confirm that risk score and review status appear in withdrawal history.
6. Enter the wrong PIN five times only on a test account to verify the 30-minute lock.

## 7. Test admin risk queue

Open:

```text
/admin/risk
```

Review security events, resolve events, and change a user's payout risk status to Active, Review, or Blocked.
