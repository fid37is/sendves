# Campaign editor: implementation notes

Maps `Sendves_Campaign_Editor_Change_Log_and_Implementation_Guide.pdf` (section numbers) to the code.
The editor in use is `src/components/dashboard/campaign-editor.tsx` with `src/components/editor/*`; its model
and renderer are `src/lib/email/campaign.ts`. (`src/lib/email/design.ts` and `src/components/campaign/*` are an
older model that only saved templates still use; the campaign editor does not.)

| Guide | What | Where |
|---|---|---|
| 2 Modes | Locked templates / custom layout, plain-words mode label, "Change template" / "Add content", switch dialog listing what carries over and what is set aside, undo restores mode | `switchLayout`, `planTemplateSwitch`, `customizeCarryOver`; `SwitchDialog`; `undo` |
| 3 Blocks | Image block (own picture, width 100/75/50, alt, link), **Image grid** (2 or 3 per row, max 6, alt and link each) | `EmailBlock`, `imageHtml`, `galleryHtml`; side panel `imageEditor`, `galleryEditor` |
| 4 Links | `https://` and `mailto:` only, enforced on the server for buttons, images, grid images, products and social | `isValidLink`, `sanitizeBlocks`, renderer only emits `href` for valid links |
| 5 Text formatting | Alignment, bold, italic, colour and reset for a whole block; template slots and custom blocks; colours validated as `#rrggbb`; button text colour automatic, a chosen colour wins | `Fmt`, `sanitizeFmt`, `fmtCss`, `buttonTextColor`; side panel `fmtControls` |
| 6 Images | Upload kinds `logo`, `banner`, `image`, `grid`; resized in the browser (logo 400 px, images 1200 px, grid squares 600 px), metadata removed by re-drawing, 5 MB source limit, JPEG/PNG/GIF/WebP accepted | `components/editor/image.ts`, `api/campaigns/assets`, `server/email-assets.ts` |
| 7 Brand colours | A colour picker and hex field (any `#rrggbb`, chosen per campaign); new campaigns start from the product action colour; text on it light or dark by WCAG contrast | `config/brand.ts`, `lib/email/color.ts`, side panel Brand tab |
| 8 Audience | **Type or paste** next to **From a list**; live valid / duplicate / invalid note; server re-reads, de-duplicates, applies suppression and consent, max 500 at a time | `setup-step.tsx`, `lib/validation/paste-contacts.ts`, `pasteAudienceAction`, `ingestContacts` |
| 9 Review | Blocking: subject, audience, unsubscribe, button links, variable fallbacks (+ sender, address). Warnings: logo, products without links, **images without alt text**, **skipped addresses**, **button text hard to read**. Same function runs on the server before sending | `reviewChecks`, `submitCampaignAction` |
| 10 Content checks | Named "Content checks", states it does not predict inbox placement; setup shows domain authentication status | `scanContent`, `ReviewDialog`, `SetupStep` |
| 11 Preview | Preview as one contact, compare side by side (choosing a contact leaves compare), desktop/mobile, theme button names the mode you switch to | `PreviewStep` |
| 12 Email HTML | Table-based, 600 px, inline styles; no flexbox, grid or `calc()` (a test guards this); plain-text part and `List-Unsubscribe` headers are built in `buildEmail` | `renderCampaignHtml`, `server/sending/render.ts` |
| 13, 14 Accessibility, mobile | Keyboard-focusable blocks, dialog focus trap, hidden closed drawer, `aria-pressed` toggles; the panel closes on phones after template, block, preset, colour, variable or new image; toolbar stays on one row | `Canvas`, `Modal`, `SidePanel`, `mclose` |

## Decisions taken

- **Typed or pasted addresses are saved as contacts.** The person confirms they have permission; the server skips
  anyone unsubscribed, bounced or reported, and respects the plan's contact limit. People without
  `contacts.manage` can only use addresses that already exist.
- **Pasted limit is 500** (`MAX_PASTED_RECIPIENTS`); larger sets go through a file import into a list.
- **Formatting is per block**, not per selection. Moving to selection-level formatting means a restricted rich-text
  editor (`b`, `i`, `a`, `br` only) and a new sanitizer.
- **Grid pictures are cropped to squares when uploaded**, so mail clients that ignore CSS cropping show them evenly.

## Not done, and why

- **Banner stays on the campaign design**, not on the workspace brand profile (the logo already is). Moving it changes every
  existing campaign's banner and needs a migration decision.
- **Per-link click-tracking opt-out**: tracking is on for every link; the guide lists defaults as an open decision (section 17).
- **Versioning and edit-conflict handling** for two people editing (section 15): autosave is last-write-wins.
- **Outlook desktop**: no VML button fallback; the banner crop relies on `object-fit`, which Outlook desktop ignores.
