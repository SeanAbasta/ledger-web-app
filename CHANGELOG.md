# Changelog

What changed in each version, newest first. To get a new version into your own copy, see "Keeping your copy up to date" in the [README](README.md). Updates only replace the app's code. They never change your data repo or your browser's copy.

## V2.0.3 (2026-10-23)

A small patch about clearer words, large numbers and Windows High Contrast. Nothing about your data changes, so an older copy keeps working.

- **The amount you type** is 84 px on a computer, not 150 px. It is the size it already had on a phone.
- Data health no longer says "Safe on GitHub" while changes are waiting or a push is failing. It says "Changes are waiting to sync", or "Sync is not working" (with the dot on the gear) and that your changes are safe on this device.
- The sync status now carries a real reason for a bad token, instead of the screens guessing from the message wording.
- The conflict screen says Merge saves both versions to Downloads.
- Installment payments are capped at 600. Edit plan froze for seconds on very large numbers.
- Pressing Save twice in the same instant no longer adds the entry twice.
- Search all months does less work on each key when you have years of entries.
- In Windows High Contrast the picked segment, chip and switch, the Save button, the sync dot and the open room's mark show up again, and the category strip, calendar and card faces keep their colours.
- The three fonts the first screen uses are asked for at the start, so the big figures do not jump on a slow first visit. The switch and the segmented key no longer overshoot.

## V2.0.2 (2026-10-23)

A small patch for tablets, keyboards and screen readers. Nothing about your data changes, so an older copy keeps working.

- On a tablet-sized screen (701 to 900 px wide) with Large or Larger text, the top bar no longer runs off the edge. The sync pill and the gear stay on screen, and a long pill label ends in an ellipsis.
- On a computer, the edit pane beside the Ledger takes focus when it opens, closes with Escape or a Cancel link, and gives focus back to its row. Closing it, or changing room, with changes typed in it asks "Discard changes?" first. Saving never asks.
- Return in the Note field saves when you use a keyboard and mouse. On a phone or tablet it still closes the keyboard.
- What you typed on Add is kept when you leave Add to look something up, and is there when you come back (one slot for expense, income and transfer). Saving empties it, and a reload clears it.
- The Dashboard calendar is one tab stop. Arrow keys, Home and End move between days.
- A "Skip to this room" link is the first stop on every screen, and Dashboard section labels and Ledger day heads are real headings for screen readers.

## V2.0.1 (2026-10-23)

A small patch after a review of V2.0.0. A new app icon and a few fixes. Nothing about your data changes, so an older copy keeps working.

- **New icon**: a paper L and a small blue point on an ink tile. The point is the decimal point of 0.00. The browser tab has a sharper version. An iPhone keeps the old home screen icon until you remove the app and add it to the home screen again. The offline copy of the app refreshes once after the update.
- Undo of Save no longer refills the Add form every time you come back to it. The values come back once, right after you press Undo.
- If an Undo ever fails, the message says what is true: after a delete, the entry is still deleted.
- The token warning says "expires today" on the last day instead of "expires in 0 days".
- The line at the top of the Ledger says how many plan payments are coming in the next 30 days, which is what it counts.
- Tests: more of the date edges in Coming up, Again chips and Data health are covered, and test data uses made-up account and person ids only.

## V2.0.0 (2026-10-23)

Ledger 2. Five screens named for the question each answers, four missing controls (Undo, settling part of a balance, repeat chips, editing a whole plan), a list of what leaves your bank next, and a new look called Folio with a two-pane layout on a computer.

No new kinds of data are stored and nothing about your data files changes, so an older copy keeps working with everything you save here. Update both computers so they show the same screens. The app's colour in the phone's status bar changed, so the offline copy of the app refreshes once after the update.

Rooms:

- Splits is now **People** and Forecast is now **Coming up**, in the same places in the tab bar. Settings moved behind a gear at the top right, so the phone tab bar has five tabs.
- **Coming up** has three views, remembered on each device. **Soon** lists what leaves your bank in the next 30 days: card bills on their due dates (an estimate until the statement closes, then exact, and Paid until the due date passes), payments straight from a bank, card charges still to come with the bill each lands on, and what people owe you. Its figures are the forecast's own. **12 months** is the old Forecast, with your salary months at the foot. **Plans** is the old Recurring list.

Add:

- New order: amount, **Again**, note, category (four chips and More), account and date on one row, split, then **Repeats**. Save stays in view above the tab bar on a phone, and on the keyboard while you type.
- **Again** chips: your most repeated notes of the last 30 days (three uses or more). A tap fills the note, category and split, never the amount.
- After Save a short message names what was saved, with your share and who owes, and **Undo**. Undo takes it back out and puts the values back in the form. On the Add tab, Return in Note closes the keyboard instead of saving.
- A first run shows a short checklist: name an account, set up sync, add a salary.

Ledger:

- Each day shows the full amount and, under it, your share (the same figure the Dashboard shows for that day).
- The Next 30 days card is now one line that opens Coming up.
- **Edit plan** changes a plan's start, how often, number of payments and total, or end date, with a preview of exactly which payments move, appear or go before you save.
- Delete now has **Undo**.

Dashboard:

- A **Month** and **Year** switch. Categories are one strip with amounts in the legend, and the ring around Spent is now a thin line against last month's same days, left out when there is no earlier month. Small categories fold into "Everything else".
- Tap a day on the calendar to open it in the Ledger.
- Still due says "yours" and links to Coming up.

People:

- **Settle up** takes all of it or part of it (never more than the balance). After a part payment the unpaid lines stay in view and the payment shows as "Paid". Each line shows the balance after it. Settling has **Undo**.

Settings:

- A **Data health** card on top says whether your data is safe on GitHub or backed up, and when your token needs renewing. A small dot on the gear shows when the token needs renewing or nothing has been backed up for 14 days.
- New accounts and cards are named before they are created.
- General: **Text size** (Default, Large, Larger, kept on each device), **Keep Undo until dismissed**, and **Keyboard shortcuts** on a computer.

The look, Folio:

- Paper and ink instead of the machined plates: a light ground, sections separated by fine rules instead of cards, one blue for what you press and where you are, green for money in. Dark mode is the same design in reverse.
- Two typefaces, served by the app itself (nothing is fetched from anywhere else): Spectral for figures and headings, Hanken Grotesk for everything else. Figures line up in columns.
- Bigger figures: Spent is 84 px on a phone and up to 190 px on a wide screen, stepping down when the amount is long. Each Ledger day starts with its date as a large numeral. The phone tab bar is plain paper with a small blue mark on the open room. Card tiles show a small card face beside the name. The Snapshot image follows the new look.

On a computer:

- A top bar instead of the sidebar. At 1200 px and wider the Ledger shows the list with the open entry's edit sheet beside it (it asks before dropping changes), and Add reads in two columns.
- **Keyboard shortcuts**: N new, / search, [ and ] previous and next period, T today. Settings can turn them off.

Also: the conflict screen says first that nothing is lost and marks Merge as recommended; the forecast's headline and note say what it assumes; larger tap areas and named controls for screen readers.

## V1.4.1 (2026-10-20)

A new look for Ledger, called Anodized. Same features, same numbers, and nothing about your data changes. Update both computers so they look the same.

- Silver by day, space black by night. Cards are machined plates, the top bar and the phone tab bar are smoked glass in both themes, and blue is used only on things you can press.
- Figures are set light, with the currency sign and centavos small and raised. Section labels are small capitals.
- Dashboard: Spent sits in a ring that measures this month so far against last month's same days. Anything over last month shows as an amber arc.
- Dashboard: the Daily chart is now a calendar of days, lit by how much you spent. Today is ringed and planned days are outlined.
- Card tiles are deeper in their own colour, and the credit bar is marked every 10% with "N% used".
- Splits: a person's list reads like the Ledger. What they owe you is green with a plus, what you owe is plain. Each person shows their balance as a figure. The snapshot image is unchanged.
- Forecast opens on the chart and the month table, with the salary months below. The table fits small phones.
- Drawn icons instead of text symbols, a clearer focus ring, larger tap areas on phones, and switches that slide.
- The app's colour in the phone's status bar changed, so the offline copy of the app refreshes once after the update.

## V1.4.0 (2026-10-20)

Faster everyday logging, mostly on the phone. Log several expenses in a row without leaving Add, pick the category with one tap, see who owes what before you save a split, and find an entry from any month. Deleting now asks for a second tap.

No new kinds of data are stored, so an older copy of the app keeps working with everything here. Update both computers to get the new screens.

Add:

- After Save you stay on Add, with a line such as "Saved: Coffee ₱250.00. View". View opens the Ledger at that date. Amount, note, date, type, the split and Bill on next statement start fresh; account and category stay. A recurring or installment plan that starts later still opens the Ledger at its first payment.
- Category is a row of buttons instead of a list. An entry whose category is not in Settings (a salary entry, a refund, a removed category) keeps it as an extra button.
- Note is a full-width box ("What was it?") right after the category. Return in Note saves.
- Split: pick who paid first. The modes then fit the payer: Even, They owe or Custom when you paid; Even, I owe or Custom when someone else did, so "You must be the payer" can no longer happen. A line under Mode says who owes whom ("Alex owes you ₱1,500.00") before you save, worked out the same way Save does.
- Split, Custom when someone else paid: a new "You owe" box for your own share. Before, your share was always zero in that case.
- "50/50" is now called "Even", since it splits equally among everyone, also with three or more people.

Ledger:

- Split rows show your share under the amount, for example "yours ₱1,500.00". Day totals still show the full amount paid.
- An upcoming payment that is in the "Next 30 days" list is no longer also listed above today. It shows in the day list on the day it happens.
- Search all months: while searching or filtering by category, "Search all months" shows every match from your first entry to 30 days ahead, plan payments included, grouped by month.
- The "Tap an entry to edit it" hint is gone. Rows still show their arrow.

Safer and clearer:

- Delete, End series and Skip this one ask for a second tap ("Delete Coffee?"). Tapping elsewhere or waiting a few seconds cancels.
- Dashboard: when you look at another month, a note says the cards, accounts and owed below show today's numbers.
- Empty screens offer a way forward: "Add expense", "Search all months", or "Open Settings" when a transfer needs a second bank account.
- The conflict choice reads "Keep GitHub's version", and "Re-pull" is now "Download again".

Settings:

- Leaving an account or card field without changing it no longer saves (and syncs) it again. A real change shows "Saved" for a moment.
- After a change, the next field you tap in the same account keeps focus, so on the phone the keyboard stays up.

Phones and computers:

- On phones, the period arrows, Today, the segment buttons, switches and remove buttons are easier to tap, with nothing on screen moving.
- On computers, Escape closes the top sheet, each sheet has a close button, and the keyboard focus ring shows on every control.

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
