import assert from "node:assert/strict";
import test from "node:test";
import { isApprovedSellerProfile } from "../lib/sellerSecurity";

test("admin profile can use seller-protected finance endpoints", () => {
  assert.equal(isApprovedSellerProfile({ role: "admin" }), true);
});

test("seller access requires approved seller status", () => {
  assert.equal(
    isApprovedSellerProfile({ role: "seller", seller_status: "approved" }),
    true
  );
  assert.equal(
    isApprovedSellerProfile({ role: "seller", seller_status: "pending" }),
    false
  );
  assert.equal(isApprovedSellerProfile({ role: "seller" }), false);
});

test("regular users cannot use seller-protected finance endpoints", () => {
  assert.equal(isApprovedSellerProfile({ role: "user" }), false);
  assert.equal(isApprovedSellerProfile(null), false);
});
