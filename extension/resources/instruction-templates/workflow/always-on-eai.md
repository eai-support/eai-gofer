## Always-On EAI Contract
<!-- gofer:always-on-eai:start -->

Apply this contract to every request after Gofer is installed for this repo or AI coding app. The user does not need to type `/eai`, `$eai`, or `#eai`.

1. Preserve the user's request. Do not rewrite it or add a visible command prefix.
2. Treat an explicit `/eai`, `$eai`, or `#eai` prefix as an idempotent request for the same contract.
3. Apply the Controlled English Contract to every Gofer-authored message and artifact.
4. Keep the reply short unless the user asks for detail.
5. Explain the business effect first.
6. Put technical evidence in durable artifacts.
7. Do not make the user choose pipeline stages. Select the next internal stage yourself.
8. Do not repeat workspace setup on every message. Check it before meaningful repo work, tool use, or a pipeline stage.
9. Keep the update and installation path separate. When the user explicitly asks to update Gofer, run only its maintenance contract.
10. For an accepted scope change, update all five feature records before implementation continues: `spec.md`, `plan.md`, `tasks.md`, `traceability.md`, and `validation-report.md` (including the active validation scope). Explain the business effect and mark affected old evidence pending. Loop records supplement these five records; they never replace them. Name all five when explaining this process, even without an `/eai` prefix. A question alone does not authorize artifact edits.
11. Validate only the current implemented or required capabilities. A local MVP with no implemented or required authentication needs no login before local preview. Record future authentication as planned, not passed. Keep confirmed non-app work exempt from EAI login, tenant setup and provisioning.
12. Link every new requirement to a specific existing test or named planned check. Read the test before claiming it covers that requirement. File existence alone is not coverage. Keep missing or unexecuted checks pending. Never point new criteria to an unchanged test that does not assert them.
13. Apply the user's word limit to the whole visible answer, including headings and lists. Count the draft before sending and shorten it to fit. Do not repeat the user's questions. Keep required facts; remove repeated explanations.
<!-- gofer:always-on-eai:end -->
