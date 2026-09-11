# COMEPLAYERS PROJECT MEMORY

## Origin

ComePlayers was built as a gaming marketplace.

Goal:

Buyers and sellers can trade:

* Game accounts
* In-game services
* Digital gaming products

Powered by EvoGaming.

---

## Important Historical Events

### OAGE.TSX INCIDENT

Seller orders page returned:

404

Cause:

File accidentally named:

oage.tsx

instead of:

page.tsx

Issue discovered after long debugging session.

---

### REGISTER SYSTEM REWORK

Original system separated:

* Buyer
* Seller

Decision:

Single account system.

Any account can:

* Buy
* Apply for seller status

Seller access unlocked through verification process.

---

### SELLER APPLICATION SYSTEM

Created:

seller_applications table

Application includes:

* Seller name
* Legal name
* Phone number
* Discord
* Identity number
* Identity image

---

### PHONE COUNTRY SYSTEM

Installed:

react-phone-number-input

Supports international country codes.

Goal:

Global marketplace support.

---

### ADMIN ACCESS BUG

Issue:

Admin page always showed:

Access Denied

Root causes discovered:

* Missing profile records
* Role mismatch
* RLS policy recursion

Resolved after multiple Supabase fixes.

---

### PROFILE NOT FOUND BUG

Issue:

Seller application page:

Profile not found

Cause:

Profile row missing or inaccessible.

Required profile verification before application submission.

---

## Current Relationship Model

User Account
↓
Profile
↓
Seller Application
↓
Admin Verification
↓
Approved Seller

Marketplace access granted after approval.

---

## Development Philosophy

Build real marketplace infrastructure before advanced features.
