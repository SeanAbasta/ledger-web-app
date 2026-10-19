# Changelog

What changed in each version, newest first. To get a new version into your own copy, see "Keeping your copy up to date" in the [README](README.md). Updates only replace the app's code. They never change your data repo or your browser's copy.

## V1.3.1 (2026-10-19)

More of your money in one place. Record income besides your salary and move money between your own bank accounts. See all your recurring payments together, what is planned for the rest of the month and the months ahead, and a whole year at a glance. Split statements now show what each item cost in full.

No new kinds of data are stored, so an older copy of the app keeps working with everything here. Update both computers to get the new screens.

- Add: a switch at the top picks Expense, Income or Transfer.
- Income: record money from other sources (Gift, Interest, Sale, Side Job, Spare Change or Other) into a bank account, in that account's currency. It raises the account's balance and shows in the Ledger in green with a plus. It is never counted as spending. Salary is still set on Forecast.
- Transfers: move money between two of your bank accounts in the same currency. The total stays the same, it is never spending or income, and a transfer dated later changes nothing until its date. Paying a card is still the Pay button on its tile.
- Dashboard, Recurring: one list of every recurring payment and installment plan, with the next date, account and payments left, plus what they cost you a month (your share of splits). Tap one to edit, skip or end its next payment. Ended plans are tucked away at the end.
- Dashboard, planned spending: the category chart and daily bars now include what is still scheduled this month, marked "incl. upcoming", with days still to come in grey. Spent stays what you have actually spent. A later month shows its scheduled payments as "Planned" instead of an empty page.
- Dashboard, Year: spent, income and net for the year so far (or a whole past year), a month by month chart (tap a month for its numbers), your top categories, the average month, the highest and lowest month, and a comparison with the same dates last year.
- Splits: the statement image shows each item's full price next to the person's share, under Date, Item, Total and Your share, so nobody thinks they paid for everything. The Splits list shows the full price too.
- Editing a transfer or card payment also lets you change its note.
- Fixed: the daily chart's first day label was missing on every month except the current one.

## V1.3.0 (2026-10-18)

Filters and charts you can tap. See one category in the Ledger, one account's spending on the Dashboard, what is inside each slice of the category chart, and each month of the Forecast. Picking people for a split is a tap instead of typing.

No new kinds of data are stored, so an older copy of the app keeps working with everything here. Update both computers to get the new screens.

- Splits: turning Split on shows your people as buttons. Tap to include someone, tap again to take them out. Paid by is a row of buttons too: Me, the people in the split, and anyone removed since. A new name can still be added with the Add field; it is saved with the expense. On iPhone you no longer have to type every name.
- Ledger: a category filter next to Search, for Day, Week and Month. It works together with Search, the day totals follow it, and removed categories on old entries can still be picked.
- Dashboard: an account filter next to the month. Pick a bank account, a card, or "No account or removed" to see that spending only: Spent and its comparison with last month, Still due, the category chart and the daily bars. Balances (cards, accounts, owed, the forecast) always show everything, and a note says so.
- Dashboard: hover or tap a slice of the category chart, or a row of its legend, to see the amount, its share and its three largest items. The grouped "Other" lists what it contains.
- Forecast: the projected balance chart shows 3, 6 or 12 months, starts from today's balance, names the months, marks months with no income set, and shades any month that ends below zero. Tap or hover a month for its income, spending, card bills and change. Under the chart: the lowest and highest point, the change over the range, and how many months end below zero.
- Splits someone else paid are saved with no account. Before, the form could keep your default account on them; balances already ignored it, and the Dashboard filter counts those older ones as "No account" too.

## V1.2.4 (2026-10-15)

Safer removing of bank accounts and cards. Before, removing one that was in use only warned you: its entries and plans then counted as "Other" on the Dashboard, a bank's starting balance left your total, and a card's balance owed disappeared. Adding the account again did not bring anything back.

No new kinds of data are stored, so an older copy of the app keeps working with everything here. Update both computers to get the new screens.

This release also collects the smaller changes that went out quietly in V1.2.1 and V1.2.3 and in between, listed at the end.

Now includes:

- Move before you remove. When a bank account or card has entries or plans, removing it offers "Move to [account] and remove". Its entries, card payments, plans and any default set to it move to the account you pick, then it is removed. A card moves to another card, and a bank account to another bank account in the same currency, so your total stays the same. "Remove anyway" is still there.
- Restore. Settings, Accounts lists removed accounts and cards with a Restore button. Restoring brings back the same account, so everything that still pointed at it reconnects and its balance returns.
- Fix leftovers. If any entry or plan points at a removed account, the Dashboard's Accounts card shows "Other" with a Fix link. It lists them and moves them all to one account you pick.
- Card payments and other transfers can be edited: from, to, amount and date. Before, they could only be deleted.
- Forecast, "Paid into": changing it now moves your salary from this month on, for a repeating salary and for salaries typed in month by month. Earlier months stay in the account they were paid into.
- A bank account's starting balance is now labelled "Balance before your first entry", with a hint to use today's balance only if nothing is logged yet. Typing today's balance while older entries exist counts those entries twice.

Also in this release, shipped quietly since V1.2.0:

- Removing a person or a bank account that is in use asks first and says what is affected, for example "Alex is on 4 entries. Alex owes you ₱1,000.00."
- Categories are removed only after tapping Edit, with bigger targets, so a stray tap cannot remove one.
- Editing a split never drops a person who was removed in Settings. The Ledger names removed people and accounts, for example "Bank A (removed)", instead of showing "?".
- Edit sheets open without the keyboard, so on phones the whole form shows. Only the Add tab focuses the amount.
- On phones, pinch and double-tap zoom are off, and tapping a field no longer zooms in.
- Switches have names for screen readers.
- Small phones: tags never split across lines and buttons do not wrap.
- On a card tile the Due row says "Change", so it reads as editing the due date rather than opening a page.
- Settings is a short list of pages (General, Accounts, People and categories, Sync and backup) instead of one long page.
- Sheets and bars stay readable on computers where the browser draws no blur, seen on Windows.
- The Dashboard's daily chart has day labels, the daily average, the highest day and the number of days with no spending.
- The Dashboard's Accounts card shows what your total would be if everyone paid you back, and after your card bills.
- Open dropdown lists are readable in dark mode on Windows.

## V1.2.2 (2026-10-11)

A new look. The screens and features are the same, and nothing about your data or your numbers changes.

Card colours are saved with your data. An older copy of the app ignores them and keeps them, so nothing breaks if one computer updates later. It just shows the old look until it is updated.

Now includes:

- A calmer background, the way Apple's own apps do it: light grey in light mode and true black in dark mode, cards one step lighter, and a faint blue glow at the top.
- Big amounts in Apple's rounded font where your browser has it (Safari), with a smaller peso sign and centavos. Digits line up in columns everywhere.
- On phones the tabs move to a bar at the bottom, each with an icon, so all six are always visible and under your thumb. On a computer the sidebar shows the same icons and stays in view while you scroll.
- The top bar stays at the top and the page scrolls under it. On iPhone its title and sync status should now look sharp, instead of blurry until you pulled the page down.
- Ledger rows show what you bought first, then a colour dot, the category and any tags. Amounts have no minus sign. Income, refunds and money paid back to you are green with a plus. Each day and its total stay pinned at the top while you scroll through that day.
- Each category keeps its own colour, the same in the Ledger and in the Dashboard's category chart.
- The Dashboard leads with Spent, with a bar comparing it with the same days last month. Still due and Last month sit side by side, and Last month says "No data" instead of ₱0.00 when there is nothing to compare.
- Each credit card's tile looks like the card, in its own colour. Pick the colour in Settings, Accounts. A bar under Credit left shows how much of the limit is in use.
- Daily bars have rounded tops, and the category list uses two columns on wide screens.
- On big screens the content stays in a centred column instead of stretching across the window.
- Friendlier messages when a list is empty, and "No matches" when a search finds nothing.

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
