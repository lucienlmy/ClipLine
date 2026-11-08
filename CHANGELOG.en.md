# ClipLine changelog

Newest first. This file is built into the app and is what Settings → About → "Update history" shows; the Chinese version is `CHANGELOG.md` — keep the two in step.

## v1.11.0 · 2026-11-08

### ☑ Tick to-dos anywhere
- **On the reminder card**: click a to-do's box on a reminder that has popped up to tick or untick it. The note on the line updates too, and the card stays open.
- **While editing**: click inside a `[ ]` to make it `[x]` (click again to clear it); `Ctrl+Enter` ticks the caret's line, or every selected line (if any is open they are all ticked, otherwise all cleared). `Ctrl+Z` undoes either.

### 📄 Drag a note to the desktop as a file
- Drag a note by its body: dropped on the desktop or in a folder it becomes a file named after the note's title; dropped into a chat box or document it inserts the Markdown text. The note stays on the line.
- .txt or .md follows the same setting as text cards: Settings → Clipboard → "Text cards & notes dragged to a folder become".
- Dragging by the clip still reorders; ticking boxes, clicking links and dragging the scrollbar work as before.

## v1.10.3 · 2026-11-07

### 🐞 Fixed
- Screenshots: after drawing a frame, a few mouse moves could freeze the whole desktop, pointer included (most visible on a second monitor), until Esc was pressed. The overlay was GPU-rendered, which on some machines (e.g. a mini PC's integrated graphics) stalled the whole desktop's redraw. The overlay is now software-rendered; other windows are unaffected.
- Each monitor gets its own overlay and a selection stays within one screen; starting a frame on another screen drops the old one. Screens with different scaling work too.
- The dimming is drawn far more cheaply and mouse moves are handled once per screen refresh.

## v1.10.1 · 2026-11-07

### 🖼 Small icons redrawn
- The tray icon and the 16 / 24 / 32 px frames of the app icon use a simplified drawing — no corner marks, bolder lines, bigger cards — so they read clearly in the taskbar and tray.

### 🎨 Appearance
- Tray icon colours are listed in the same order as the accents (Terracotta, Mint, Sky, Navy, Leica red), so the two rows line up.

### 🐞 Fixed
- Screenshots: after a frame was drawn the overlay could stop responding (seen on a second monitor) — the pointer moved but nothing could be dragged or clicked. The overlay's background calls no longer run on the main thread, and drags use pointer capture so a release is never lost.

### 📘 Docs
- The guide shows the new screenshot bar.

## v1.10.0 · 2026-11-07

### 🖼 A new icon
- Two cards on the line — a picture and a page of words — inside a camera's corner marks: screenshots, clipboard and notes, visible at a glance. The app icon and all five tray colours are redrawn.

### ✂ Screenshots: choose first, then take
- A drag or a click only selects; Enter, a double click on the frame or the ✓ at the right end of the bar takes the picture. A wrong frame can be fixed before it counts.
- Windows light up under the pointer — **click to select a whole window**; over the empty desktop it selects the whole monitor.
- The frame can be adjusted: drag its 8 handles to resize, drag inside to move; arrow keys move it 1 px (Shift: 10), Ctrl+arrows change its size.

### 🧰 The screenshot bar is icons now
- Annotate `E` · Recognise text `W` · Pin `P` · Pick colour `C` · Select again `A` · Cancel `Esc` · Hang `Enter` — keys in each icon's corner, descriptions in the tooltips.
- The bar follows the theme and accent: dark under Graphite, no longer a hard-coded white strip.

### 💧 Colour picker
- Press `C` (or click the dropper) while capturing: a loupe follows the pointer; click to copy `#RRGGBB` and hang a colour card — no image file is saved.
- It reads the screen's real pixels, so the colour is exact.

### 📋 Paste into the current app
- Notes get "Paste into the current app" too (pastes the Markdown source); text, link and colour cards already had it — it now sits right under "Copy" with the same name everywhere.

### 🎨 Appearance
- New accent: **Leica red**.
- The "Pepsi blue" tray icon is now **Navy**.

### ☕ A Tip jar page in Settings
- WeChat Pay and Alipay codes. Entirely optional; unlocks nothing.

### Other
- OCR results are counted per script: characters for Chinese, words for English and other languages.

## v1.9.0 · 2026-11-06

### ⚙ Settings, reorganised
- A sidebar now splits Settings into General, Invoke & hotkeys, Clipboard, Notes, Appearance and About — each page fits on one screen. The window is wider (720×540).
- Save / Cancel still cover every page; switching pages keeps unsaved changes.
- The two "keep for" settings are now separate and labelled: "Keep clipboard cards" (favourites are kept) on Clipboard, "Keep notes in the done bag" (notes on the line are never cleaned) on Notes.

### 🧺 Change the done bag's period from the bag
- Click "Kept 30 days ▾" at the bottom of the bag to pick 7 / 30 / 90 / 365 days or forever right there; it applies at once and is saved to Settings.
- If a shorter period would remove notes, it first asks "Remove N?" — click again to confirm.

### 🔔 New reminder time picker
- "Custom time…" opens ClipLine's own picker: a month calendar plus large hour : minute fields and an OK button — no more clicking elsewhere to close the system picker.
- Scroll the wheel over hours or minutes (minutes step by 5, hold Shift for 1), click ▲▼, or type; 00 / 15 / 30 / 45 shortcuts below the minutes.
- Enter confirms, Esc goes back; times in the past can't be picked.

### 📋 "Copy text" on notes
- Right-click a note → "Copy text" copies the whole note without opening it (Markdown source kept as-is).

### Other
- Esc in the reminder popover inside the editor now closes the popover first, not the editor.

## v1.8.0 · 2026-11-04

### 🏷 Note categories
- Every note has one category, shown as its colour. Defaults: Work, To-do, Ideas, Life, Reference, Later, Urgent; anything else is "No category".
- Pick one from the chip at the top left of the editor; "Manage categories…" renames, deletes and adds (four new colours — purple, pink, teal, brown — up to 11 categories). Deleting a category keeps its notes, uncategorised.
- Notes you already coloured fall into the matching category.
- With two or more categories in use, the notes line shows category filters in the bottom bar.

### 🧺 The done bag
- A linen bag hangs at the right end of the notes line, showing how many finished notes it holds.
- ✕ on a note now means done: the note and its to-dos go into the bag with the date (undo for 5 s). To drop a note without a record, right-click → "Delete (skip the bag)".
- Notes whose to-dos are all ticked can go in together with "Tidy N" in the bottom bar.
- Click the bag to see this month's count (e.g. "12 notes · 47 items · Work 8"), then the notes grouped by month; put any back on the line, delete one, or empty the bag.
- Kept 30 days by default; Settings → Auto cleanup offers 7 / 30 / 90 / 365 days or forever.

### 🌐 Tray menu
- The right-click menu now follows the app language instead of showing both; it switches as soon as you change the setting.

## v1.7.0 · 2026-11-04

### 📄 Notes that don't fit
- When a note is longer than its card, the bottom fades out and a "N more lines" tag appears.
- With the pointer over that note, the mouse wheel scrolls the note (a thin scrollbar shows on the right); everywhere else the wheel still flips pages.
- **Click a note to open the reading view**: the whole note in a larger panel — tick boxes and click links without any risk of editing it. Double-click still edits, and the reading view has an "✎ Edit" button.

### 🕘 Update history
- The first time ClipLine starts after an update, a "Updated to vX" card pops up once in the bottom-right corner with what changed.
- Settings → About → "Update history" lists every release, newest first. It's built into the app, so it works offline.

### 📘 Docs
- README and the user guide rewritten to match today's features.

## v1.6.0 · 2026-11-04

### ☑ To-do lists in notes
- New "☑ To-do list" button above the editor turns the current or selected lines into to-dos; click again to undo.
- Accepts `- [ ]`, `[ ]` and `[]` (the `[]` shown in the old hint didn't actually work — fixed).
- Enter continues the list, Enter on an empty item ends it; `Tab` / `Shift+Tab` indent.
- Tick boxes right on the card; the title shows progress (e.g. 2/5, green when all done).

### ✍ Markdown
- Note cards and reminder cards render Markdown: bold, italic, strikethrough, headings, lists, numbering, quotes, code, links, rules.
- Formatting buttons and `Ctrl+B` / `Ctrl+I` in the editor; "👁 Preview" shows the result and lets you tick boxes.
- Links in cards and reminders open in the browser with one click.
- Text cards on the clipboard line stay exactly as copied — no Markdown rendering.

### 🔗 Notes on link cards
- Right-click a link card → "Add note", or double-click it and type below; up to 100 characters.
- The note shows at the top of the card (two lines, full text on hover) and on the small cards in date stacks; search finds it; it survives copying the same link again.

### 🌐 Chinese / English
- Reminder cards and the update card follow the language setting (including update error messages).
- Fixed: the "Next" button's tooltip read "Next time"; "Snip" and "Tidy" weren't translated in English.

## v1.5.1 · 2026-11-03

### 🖥 Multiple monitors
- Settings → Invoke → "Line appears on": follow the mouse (default), the primary monitor, or one chosen monitor.
- With mixed scaling, the line is laid out for the monitor it's on and cards keep the same size.
- If the chosen monitor is unplugged, the primary one is used; if the line's monitor goes away while it's down, it rolls up.
- Reminder and update cards pop up in the bottom-right corner of that same monitor.
- A hover-summoned line also rolls up when the pointer leaves sideways onto another monitor.

### 🌐 "Follow system" language
- Settings → General → Language → "Follow system": Chinese when Windows is in Chinese, English otherwise.
- New installs follow the system; anyone who already chose a language keeps it.

## v1.5.0 · 2026-11-03

### ⬆ Update check
- Checks GitHub for a newer version about half a minute after start, then every 6 hours; a card in the bottom-right corner offers "Update now", "Not now" and "Skip this version".
- Check any time from the tray menu or Settings → About → "Check for updates".
- Three modes (Settings → About → "Automatic updates"): notify me (default), download automatically, off.
- Downloads show progress and can run in the background; the file size is verified before installing.
- The installer version updates quietly and reopens; the portable version replaces its own exe in place (same name and folder).
- The update check is ClipLine's only network access and sends none of your data.

## v1.4.0 · 2026-11-03

### ✂ Screenshot to the line
- `Ctrl+Alt+S` (changeable or off), the "✂ Snip" button, or the tray menu.
- Select a region, then hang it, annotate it, recognise its text or pin it to the desktop; it's copied as well.
- Works across monitors and HiDPI, at real pixels.

### ✎ Annotation
- Pen, arrow, box, ellipse, text, mosaic, numbered markers; 7 colours, 3 widths; undo / redo.
- "Done" saves a new image card and copies it; the original stays.

### 文 Text recognition (OCR)
- Uses Windows' built-in OCR: offline, no model download.
- The result hangs as a text card, is copied, and opens in the editor for checking.

### 🔔 Reminder pop-ups
- When a note reminder is due, a note-style card pops up bottom-right with a soft chime: "Got it", "Remind me in 10 min", "Open note".

### Other
- Bolder terracotta app icon; 5 tray icon colours (Settings → Theme).
- Settings → About → "Open data folder".
- Desktop-pinned images get "Annotate" and "OCR" buttons.
- Fixed: after "Open note" from a reminder or after OCR, the line could stay down.

## v1.3.1 · 2026-11-03

- Note reminders show as a small chip: "🔔 Next 11-04 09:00" with the repeat on a second line; the duplicate "Edit" button is gone (use ✎ at the top right).
- The clipboard line's bottom bar sits lower and no longer covers card edges.

## v1.3.0 · 2026-11-03

### A new layout for the line
- Favourites stay at the left end and don't move when you page; up to 3 slots, the rest gather in a stack; drag the clip to reorder them.
- Today's cards hang loose; older ones fold into "Last 3 days / This week / Older" stacks (toggle with "By date").
- Inside a stack, every card can be copied, dragged out, edited or right-clicked, and taken down singly or all at once — with undo.

### Tidy
- Cards whose files are gone turn grey; "Tidy N" takes them all down, with 5 seconds to undo; favourites are never tidied.

### Other
- Note cards are shorter and no longer touch the bottom bar.

## v1.2.0 · 2026-11-03

Not released on its own; shipped as part of v1.3.0.

- File cards show coloured type icons (Word, Excel, PowerPoint, PDF, image, video, audio, archive, code, text, program), folders get a folder icon, missing files turn grey.
- A real "move": hold Shift (or Alt / Ctrl) as the drag starts; the card is taken down once the file has moved.

## v1.1.0 · 2026-11-02

The first public release.

- Settings in their own window; five themes (Soft color, Classic silver, Linen & wood, Porcelain, Graphite) and four accent colours to mix; font and size options.
- Watched folders: new files in them hang on the line automatically.
- Drag the clip to reorder cards; file cards can be taken down with the original moved to the Recycle Bin.
- Drag cards out: text to a folder becomes .txt / .md, text into an input is inserted; files are copied by default.
- Drag files from Explorer to the top edge and the line drops to catch them.
- Several files hang as one stack you can open to copy, drag, open or split.
- One-click ☆ favourite on each card; images can be pinned to the desktop with wheel zoom.
- Pick your own reminder presets; copying the same thing again moves it to the front instead of hanging it twice.

## v1.0.0 · 2026-11-01

The first build (not released publicly).

- Clipboard line: text, links, colours, images and files collected automatically; click to copy, double-click to paste back.
- Notes line: seven colours, checkboxes, one-off or repeating reminders.
- Summon from the top edge (left half clipboard, right half notes) or with `Ctrl+Alt+C` / `Ctrl+Alt+N`.
- Filters, search, pinning, retention cleanup, tray menu, Chinese and English.
