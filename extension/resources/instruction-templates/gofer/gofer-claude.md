Run `/gofer` or `/eai-gofer` to start or continue the core pipeline: business
scenario -> research -> specify -> plan -> tasks -> implement -> validate. Gofer
routes internally through `.specify/commands/*.md` contracts; validation is the
terminal quality gate with the final engineering review loop. Checkpointing,
branding, tests, stakeholder communications, first-run setup, and diagnostics
remain internal contracts routed by Gofer. Artifacts go to
`.specify/specs/{feature}/`.
