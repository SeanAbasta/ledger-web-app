# Changelog

What changed in each version, newest first. To get a new version into your own copy, see "Keeping your copy up to date" in the [README](README.md). Updates only replace the app's code. They never change your data repo or your browser's copy.

## V1.2.0 (2026-10-10)

**Update both computers before you use "Bill on next statement".** An older copy ignores it and keeps the charge on its original statement, so the two computers would show different card numbers. Everything else works with an older copy.

Now includes:

- A Today button on the Ledger and the Dashboard. It appears next to the period when you have moved away from today. Tap it, tap the period title, or press T on a computer to jump back. Day, Week or Month stays as it was.
- "Due soon" in the Ledger is now "Next 30 days" and only shows on the period that contains today. Before, it showed on every month, so next month's payments appeared twice.
- The Pay form offers Statement (what is left on the last statement), Pay all (the statement plus everything unbilled) and Other. After the statement is paid, a Pay ahead button stays on the tile, so a second payment never needs a manual transfer.
- A card tile explains why credit left is below the limit with a line named after each installment plan, for example "iPhone hold". With several plans it shows one total; tap it to see each plan.
- Default accounts in Settings, under Defaults: the account new expenses start with, the account your salary goes into, the account card bills are paid from, and the starting category. "Use last used instead" starts with the last ones you used on that computer. With no default set, the Add form still asks you to pick an account.
- Smoother motion. Sheets slide up (on phones they sit at the bottom and close when you drag the handle down), buttons dim and shrink a little while pressed, the list slides when you change period, and tabs fade in. With Reduce Motion on in your system settings, things only fade.
- A statement view for each card. Tap the top of a card tile to see what makes up its numbers: Statement (what you owed at the start or on the last statement, then every charge, refund and payment), Unbilled, and Plans. The lists always add up to the tile.
- Reconcile with your bank, in the card view. Type any of the bank's last statement, outstanding balance and available credit. Ledger says which match, and for a gap names the likely cause: charges on one day that the bank posted later, charges still pending, a single entry or split share, or a balance from before you started Ledger. It saves nothing, except when you tap "Bill on next statement" on posting-day charges.
- Bill on next statement. A card expense made on the cut-off day or up to two days before has a switch that moves it to the following statement, for charges your bank posts after the cut-off. Only the bill it lands on changes. Spending, what you owe in total and your credit left stay the same. Moved charges are tagged "next bill".
- The Ledger shows upcoming recurring and installment payments on their future dates, tagged "upcoming" and left out of day totals.
- Editing a payment of an installment plan can move the whole plan to another account or card.
- The Add form asks for an account when you have any (unless someone else paid a split) and confirms each save. After saving, the Ledger opens at the month of the new item.
- Fixed: tapping the period arrows quickly could skip a step, and a slow load could briefly show the previous period's list.

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
