# DATABASE REFERENCE

## profiles

Purpose:

Store user profile information.

Columns:

* id
* email
* username
* role
* avatar_url
* bio
* discord
* seller_status
* seller_name
* created_at

Role values:

* user
* admin

Seller status:

* not_applied
* pending
* approved
* rejected

---

## products

Purpose:

Marketplace listings.

Columns:

* id
* seller_id
* title
* description
* price
* image_url
* category
* created_at

---

## orders

Purpose:

Purchase records.

Columns:

* id
* buyer_id
* seller_id
* product_id
* status
* payment_proof
* created_at

Status:

* pending
* paid
* completed
* cancelled

---

## reviews

Purpose:

Seller feedback.

Columns:

* id
* seller_id
* buyer_id
* rating
* comment
* created_at

---

## seller_applications

Purpose:

Seller verification requests.

Columns:

* id
* user_id
* seller_name
* legal_name
* phone_number
* discord_username
* identity_number
* identity_image_url
* status
* created_at

Status:

* pending
* approved
* rejected

---

## Important Constraints

Unique Email:

profiles_email_unique_lower

Unique Username:

profiles_username_unique_lower

---

## Authentication Source

Supabase Auth

Auth User ID:

auth.users.id

Profile ID:

profiles.id

Must always match.

---

## Critical Rule

Before debugging marketplace features:

Verify:

1. Auth user exists
2. Profile exists
3. IDs match
4. RLS policies allow access
5. Role values are correct
