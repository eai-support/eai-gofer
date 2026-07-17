This project uses Gofer for spec-driven development. In GitHub Copilot Chat, run
`#gofer` or `#eai-gofer` to start or continue the core pipeline: business
scenario -> research -> specify -> plan -> tasks -> implement -> validate.

Gofer routes internally through `.specify/commands/*.md` contracts; validation
is the terminal quality gate and includes the final engineering review loop.
Checkpointing, branding, tests, stakeholder communications, first-run setup, and
workspace diagnostics remain available as internal contracts routed by Gofer
when needed. Artifacts in `.specify/specs/{feature}/`.
