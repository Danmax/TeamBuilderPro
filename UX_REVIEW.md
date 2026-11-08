# Team Builder Pro: app and experience review

Reviewed November 8, 2026. Changes are local; no deployment or Git push was performed.

## Findings addressed

| Priority | Finding | Result |
| --- | --- | --- |
| High | Slides Studio and Backgammon were extracted into modules without activity registration or button handlers. | Both register their initial state, renderer, launch button, and activity controls. |
| High | Survey Clash had no shared session-return control, and the legacy standalone page had no navigation home. | Every activity has host session navigation. The standalone board links back to the app, which restores the saved session. It is explicitly labeled standalone. |
| High | Pressing Enter in the survey guess field could save a guess while leaving the visible board unchanged. | Survey rendering preserves the focused field, draft, and caret while updating the board. |
| High | Survey content was a local fixed bank, unsuitable for session theme imports and vulnerable to differences between clients. | Validated imported survey rounds are supported. Each game stores its question snapshot in shared room state. |
| High | Sample and global questions could dilute a session's theme. | For each supported activity, valid session content takes priority over global content; samples are the fallback. Removing the session pack restores the fallback. |
| High | Survey controls were host-only in the UI, but generic participant writes could still change its board and scores. | Server rejects guest survey-state changes and protects session content fields. Integration tests cover host changes and guest reads. |
| Medium | Returning from an activity during a queue could unexpectedly launch the next activity. | “Back to session” pauses the queue and preserves its agenda. Existing “End Activity” controls keep their next-activity behavior. |
| Medium | AI configuration exposed many fields, counts, and JSON editing tools simultaneously. | A three-step flow asks for a theme, selected activities, and an AI reply. Difficulty, count, audience, and manual editing are expandable. Room choices respect enabled activities. |
| Medium | Slides Studio offered direct AI generation even though the shared generator always throws. | Copy-prompt and validated JSON slide import replace that path; the unusable API-key field is removed. |
| Medium | A large invite/QR panel and message board pushed activity selection down the lobby. | The invite is compact, QR is expandable, and activity selection appears before messages. Search, categories, result counts, and an empty state reduce scanning. |
| Low | Survey reveal slots assumed six answers, ties read “Tie game wins,” and saved zero volume became 75%. | Reveal slots follow the selected question, tie messaging is corrected, finished games stop accepting score changes, and zero volume is retained. |
| Low | The server's activity IDs omitted Rock Paper Scissors. | Its ID is included in server activity normalization. |

## How to create themed questions

1. Open a session and choose **Create themed questions**.
2. Describe the theme and select the activities. Customize count, difficulty, audience, or tone if needed.
3. Choose **Copy AI prompt** and paste it into an AI app.
4. Paste the complete JSON reply into the app and choose **Save questions to session**.
5. Start the activity. Session questions take priority over the default library.

Survey answers require 2–8 distinct answers per round, positive whole-number points totaling 100, and an optional list of aliases. The prompt explicitly requests simulated points, rather than claiming real survey research. Plain JSON and fenced JSON replies are accepted.

The app does not make model API requests. The AI app generates the content; Team Builder prepares the prompt and validates/imports the reply. Slides Studio uses the same interaction with a JSON array of slides.

## Further improvements

| Priority | Follow-up | Why |
| --- | --- | --- |
| High | Extend server validation to participant actions in the other multiplayer games. | Generic room writes still allow broader activity-state changes outside Survey Clash. Each game should define permitted player actions and ownership. |
| Medium | Add repeatable browser coverage for complete host/guest rounds, reconnects, late joins, and timed queues. | Startup/render checks do not prove every scoring rule or game transition. The survey path and repaired controls were exercised, but every game's full lifecycle was not played. |
| Medium | Move the remaining inline games into the activity registry and derive the catalog, launch controls, and tests from it. | Activity IDs, launch switches, rendering switches, and module handlers currently overlap; that drift caused the two disconnected games. |
| Medium | Introduce per-form drafts and update game regions independently. | Most screens still replace the entire app DOM, and a broad typing guard can defer updates outside the two fields repaired here. |
| Medium | Add a question preview and active-pack selector. | Imports are validated, but hosts still inspect JSON to review or choose between several packs for the same activity. Multiple session packs currently combine for that activity. |
| Low | Remove unused direct-generation functions and obsolete standalone prototypes. | Dead paths make the supported AI workflow and authoritative game implementation harder to identify. Keep legacy links redirected or clearly labeled. |

## Verification

- `npm run check`: nine automated tests pass, including the existing live Socket.IO integration test with added host/guest survey checks.
- Browser JavaScript syntax checked for every shipped asset and inline app script.
- Headless Chrome: question prompt, fenced JSON import, themed Survey Clash, alias guess with Enter, visible reveal, preserved input focus, and return to the same session.
- Headless Chrome: Slides Studio copy/import, Backgammon initialization, and session return pausing a queued run without discarding the agenda.
- Startup/render smoke check for 23 activities; URL presentation requires a real presentation source and was excluded from that check.
- All literal rendered button actions audited against registered actions and app switch handlers; no missing handlers remained.
- 390px mobile layout checked for horizontal overflow; desktop and mobile screenshots inspected. These are layout checks, not a complete accessibility or cross-browser audit.
- Voice/WebRTC, external presentation embedding, YouTube playback, external QR availability, and full gameplay across all games were not validated end to end.

## Admin and question-builder refinement

A subsequent pass separates the admin console into Overview, Sessions, Activities, App settings, Questions & themes, and Feedback. Branding is expandable; app settings are grouped; activity availability has search and bulk presets. Edited settings survive tab changes, and a save/discard bar appears where relevant or when edits are pending. Color controls and theme choices use delegated event listeners compatible with the app's security policy.

Question creation now includes grouped theme presets, custom focus, reusable browser-local themes, named packs, and an import preview with answer details. Plain question arrays can be imported for one selected activity. Preview and save share validation; unsupported activities and invalid items are rejected, and failed saves retain the draft reply. The Message Board preference is now included in server normalization so it persists when saved.

Verification: 13 automated tests pass. An isolated headless Chrome admin session verified authentication, all six tabs, draft preservation, activity presets, settings save, saved themes, named prompts, preview without persistence, question import, and 390px layout width. These changes have not been pushed or deployed as part of this refinement.
