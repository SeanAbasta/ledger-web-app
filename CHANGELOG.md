# Changelog

What changed in each version, newest first. To get a new version into your own copy, see "Keeping your copy up to date" in the [README](README.md). Updates only replace the app's code. They never change your data repo or your browser's copy.

## V1.1.0 (2026-10-09)

**Update both computers before you use cards.** An older copy reads a card payment as an ordinary expense, cannot import a backup that has card payments, and treats refunds as income.

Now includes:

- Credit cards. In Settings, accounts are now Bank accounts and Credit cards. A card has a cut-off day (the 29th to 31st move to the month end in shorter months), days until due (25 by default), an optional credit limit, and what you owed when you added it. Existing accounts stay bank accounts.
- Put an expense or an installment on a card with the Account picker. A swipe counts as spending once, on the day you made it. An installment counts one payment a month, as before, while the whole remaining amount holds the card's limit.
- Each card has a tile on the Dashboard: the last statement and its due date (a statement is out on its cut-off day), unbilled charges, and the credit left.
- Pay a card from the tile. It records a transfer from a bank account for what is still due on the statement. A transfer is not spending or income, so Spent, the category chart and the forecast do not change when you pay.
- Move one statement's due date by tapping it on the tile, for example when the bank shifts it for a holiday.
- Refund a card expense: open it in the Ledger and tap Refund. A refund can be partial, lowers what the card owes, and lowers spending in the category it came back to.
- The forecast starts from your bank accounts only and takes each card bill from the bank on its due date. Card charges already made go on the bill at their full amount; future ones (like installment payments) go on the statement they fall in.
- The Ledger shows card payments with both accounts, and refunds with a plus.
- Settle up and the salary account only offer bank accounts.
- The spreadsheet export has a new last column, to_account, for transfers.

Not included: interest, late fees, minimum payments, automatic exchange-rate adjustment, reminders. Foreign charges use the rate you entered; if the bill differs, log the difference as an expense.

## V1.0.3 (2026-10-09)

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
