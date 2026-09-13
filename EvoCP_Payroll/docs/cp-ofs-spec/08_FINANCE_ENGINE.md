# Finance Engine

## Functional currency

Each organization has a default functional currency (ComePlayers initial default: IDR). Foreign transactions preserve original amount/currency and an FX snapshot used to derive functional amount.

## Revenue recognition

V1 management-accounting recommendation: recognize service revenue when work is operationally verified and finance-verified, not merely when cash is received. Cash receipt settles receivable. If existing ComePlayers accounting requirements differ, M0 audit must document and deliberately override this policy before implementation.

## Worker cost recognition

Finance verification of verified completion creates worker earning/payable based on compensation snapshot. Labor cost is derived from earned compensation, not from net payroll transfer after employee debt deductions.

## Core accounting account families

- Cash/Bank
- Accounts Receivable
- Employee Receivable
- Worker Payable
- Vendor Payable
- Customer Credit/Refund Payable where needed
- Service/Marketplace Revenue
- Worker Cost
- Vendor Cost
- Payment Fees
- Operating Expense
- Refund/Contra Revenue
- FX Gain/Loss/Rounding as needed

## Example service event

For Rp640,000 verified order with 50% worker share:

- Recognize customer/service revenue according to policy.
- Recognize worker cost/payable Rp320,000.
- Remaining gross contribution is derived, not posted to a “margin” account as a fake transaction.

## Cash receipt

Payment match moves value between bank/cash and receivable or other settlement account. Partial payments update outstanding rather than rewriting order gross.

## Advance

Advance issuance: increase Employee Receivable, decrease Bank/Cash. Payroll repayment reduces Employee Receivable and cash transfer to worker without reducing labor cost.

## Refund

Refund is a separate event. Use contra-revenue/refund payable/cash entries according to timing and settlement state. Original sale/payment remains auditable.

## Vendor cost

Vendor fulfillment creates vendor cost/payable according to verified fulfillment policy. Vendor payment settles payable.

## Journal posting rules

- Draft lines editable only before posting.
- Posting requires valid accounts, consistent currency treatment, open period, and exact debit/credit balance.
- Posted entry and lines are immutable.
- Reversal creates a new opposite entry and links original/reversal.

## Profit reporting

`Operating Profit = Net Revenue - Worker Cost - Vendor Cost - Payment Fees - Operating Expenses +/- approved accounting adjustments`

Debt repayment and kasbon repayment are balance-sheet settlements, not profit improvement.

## Financial issue exposure

Rule engine computes exposure deterministically. Example X1465: 640000 - 64000 = 576000. AI may explain likely zero omission but does not calculate or alter the amount.

## V2 accounting integration

### Revenue recognition
Revenue and cash are distinct. Default management recognition occurs after operational + finance verification, subject to versioned service policy.

### Worker cost timing
Recognize direct-service worker cost/payable once when earning is recognized. Payroll settlement clears payable; do not recreate the cost.

### Inventory production
For production intended for stock, eligible production cost may be capitalized to Inventory and moved to COGS when consumed/sold.

### Vendor direct
Vendor direct fulfillment records vendor/service cost and payable without fake inventory.

### Functional currency
Journal balances in organization functional currency while retaining original transaction currency/amount and FX snapshot.

### Margin
Contribution/Gross/Operating margin are reporting calculations. Never balance a journal by posting “margin”.
