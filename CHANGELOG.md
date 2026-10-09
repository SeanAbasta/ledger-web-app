# Changelog

What changed in each version, newest first. To get a new version into your own copy, see "Keeping your copy up to date" in the [README](README.md). Updates only replace the app's code. They never change your data repo or your browser's copy.

## Unreleased

Now includes:

- The Dashboard has an "Owed to you" card: the net amount people owe you (minus what you owe), with one line per person. Tap a person to open them in Splits.
- The forecast counts money owed to you as coming back this month, shown as its own line, so the 12-month projection and "End of next month" no longer treat it as spent. Recording a settlement does not change the forecast, so nothing is counted twice.

Bug fixes:

- The Ledger is now newest first inside each day too. Recurring and installment payments count as the start of their day, so they sit at the bottom of it instead of always being last.

## V1.0.2 (2026-10-08)

Now includes:

- Amounts show thousands separators as you type (1,234,567.89). This works in the Add form, custom split amounts, Edit payment, account opening balances and the monthly salary boxes. Pasting something like ₱1,250.50 works too.

Polish:

- Amounts follow the currency's decimals (none for yen). Switching currency while an amount is typed trims the extra decimals instead of changing the size of the number.
- Long amounts fit on phones without squeezing the currency picker.

Display only: what is stored and synced is unchanged.

## V1.0.1 (2026-10-07)

Now includes:

- Optional dark mode: Settings, Appearance, Light, Dark or Auto. It is a per-device choice and is not synced. Light stays the default.
- Editing is easier to find: entries show a chevron and the Ledger says "Tap an entry to edit it".
- Recurring payments can be edited for one payment, or for this and every later payment, so a price change on a subscription is a single edit. Installments can be edited one payment at a time.

Bug fixes:

- Fixed the tall navigation bar on small screens and phones.
- Fixed salary entries opening as expenses.
- Fixed salaries turning into expenses after saving.

## V1.0 (2026-10-07)

First release.

Log expenses, split them with named people, see a dashboard and a 12-month forecast, and keep your Mac and Windows PC in step through your own private GitHub repo.
