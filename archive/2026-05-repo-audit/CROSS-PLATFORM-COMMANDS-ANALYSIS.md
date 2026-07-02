# Cross-Platform Gofer Commands Analysis

**Date**: 2026-03-18 **Issue**: Slash commands not available in Codex CLI
despite v1.22.0 release claims **Reporter**: douglaswross

## Problem Statement

User expected v1.22.0 "multi-provider support" to mean Gofer slash commands
(`/0_gofer_start`, `/1_gofer_research`, etc.) work in **Codex CLI** and **GitHub
Copilot Chat**. Instead, commands only work fully in Claude Code.

## Current State

### Command Availability Matrix

| Environment             | Commands Available      | Implementation                 | Limitations                                                                                           |
| ----------------------- | ----------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Claude Code CLI**     | ✅ FULL (18 commands)   | `.claude/commands/*.md` skills | None - fully featured                                                                                 |
| **GitHub Copilot Chat** | ⚠️ PARTIAL (18 prompts) | `.github/prompts/*.prompt.md`  | • No Task tool (can't spawn subagents)<br>• No auto-chaining between stages<br>• Manual workflow only |
| **Codex CLI**           | ❌ NONE                 | N/A                            | • No skill/prompt system<br>• Just executes shell commands<br>• Would need custom wrapper             |

### What Feature 027 Actually Delivered

Feature **027-multi-provider-cli-support** implemented:

- ✅ Backend LLM provider abstraction (Claude API vs OpenAI API)
- ✅ VSCode settings to switch API providers
- ✅ CLI health checking for `claude` and `codex` executables
- ❌ **Did NOT** make Gofer commands available in Codex CLI
- ❌ **Did NOT** improve Copilot Chat command parity

**Scope**: Backend provider switching, NOT cross-platform command availability.

## Root Cause Analysis

### 1. Codex CLI Architecture Limitation

Codex CLI is a **simple command executor**, not a skill/prompt system:

```bash
# What Codex CLI does:
$ codex "write hello world in Python"
# Outputs: print("Hello world")

# What it does NOT do:
$ codex /0_gofer_start  # ❌ No slash command support
```

**Why Gofer commands don't work**:

- Codex CLI has no concept of "skills" or "slash commands"
- It's a thin wrapper around OpenAI API for code generation
- No way to register custom commands like Claude Code's `.claude/commands/`

### 2. GitHub Copilot Chat Limitations

GitHub Copilot Chat **does** support custom prompts (`.github/prompts/`), but:

**Missing Critical Features**:

1. **No Task Tool** - Can't spawn parallel subagents
   - `/6_gofer_validate` spawns 6 validation agents in parallel
   - Copilot prompts have workaround: "Claude Code only" sections

2. **No Auto-Chaining** - Each stage must be manually invoked
   - Claude Code: `/0_gofer_start` auto-chains through all 6 stages
   - Copilot: User must manually run `/1_gofer_research`, then
     `/2_gofer_specify`, then...

3. **Simplified Prompts** - Copilot versions are stripped down
   - Example: `/0_gofer_start` in Claude Code: 800 lines with discovery flow
   - Example: `/0_gofer_start` in Copilot: 150 lines, basic routing only

**Evidence from Copilot Prompt**:

```markdown
# .github/prompts/0_gofer_start.prompt.md (line 59-67)

## Your Role

When the user provides a business scenario:

1. **Understand** - What are they trying to build?
2. **Clarify** - Ask questions if scope is unclear
3. **Initialize** - Start with `/1_gofer_research` to explore codebase
4. **Auto-Chain** - Progress through pipeline stages automatically # ❌ Can't do
   this
5. **Complete** - Deliver implemented, validated feature
```

Note: Line 64 says "Auto-Chain" but **Copilot Chat cannot spawn Task tools**, so
it's manual.

### 3. Misleading Documentation

**README.md Line 81-83**:

```markdown
### Unified Commands for Claude & Copilot

**Both Claude Code and GitHub Copilot use identical command names!**
```

**Problem**: This is technically true (command **names** match) but
**misleading** because:

- Command names exist in both places
- Functionality is **vastly different**
- User experience is **not unified**

## Solution Options

### Option A: Make Codex CLI Support Gofer Commands ⭐ RECOMMENDED

**Approach**: Create a wrapper that bridges Codex CLI to Gofer skills

**Implementation**:

1. Create `extension/src/council/providers/cli/CodexSkillBridge.ts`
2. Intercept slash commands in Codex queries
3. Route to Gofer command handlers
4. Format response for Codex CLI output

**Pros**:

- ✅ Delivers on user expectations from v1.22.0 claims
- ✅ Enables true multi-provider command parity
- ✅ Relatively small code change (~500 LOC)

**Cons**:

- ⚠️ Codex CLI may not support interactive command routing
- ⚠️ Requires testing with actual Codex CLI (may not be installed)

**Estimated Effort**: 16-24 hours

---

### Option B: Improve Copilot Chat Parity

**Approach**: Enhance `.github/prompts/` to match Claude Code
feature-for-feature

**Implementation**:

1. Add "simulate Task tool" instructions to each prompt
2. Add auto-chaining instructions with checkpoint logic
3. Expand prompts to match Claude Code skill complexity

**Pros**:

- ✅ Improves existing partial support
- ✅ No CLI bridging required
- ✅ Works within Copilot Chat's capabilities

**Cons**:

- ⚠️ Still limited by no real Task tool (parallel agents)
- ⚠️ User experience still manual, not automatic
- ⚠️ Prompts would be 3-4x larger

**Estimated Effort**: 24-32 hours

---

### Option C: Fix Documentation Only

**Approach**: Clarify README and release notes about actual capabilities

**Implementation**:

1. Update README.md to show capability matrix
2. Add "Platform Compatibility" section
3. Clarify Feature 027 was backend-only

**Example**:

```markdown
## Platform Compatibility

| Feature            | Claude Code | Copilot Chat | Codex CLI |
| ------------------ | ----------- | ------------ | --------- |
| Slash Commands     | ✅ Full     | ⚠️ Manual    | ❌ None   |
| Auto-Chaining      | ✅ Yes      | ❌ No        | ❌ No     |
| Parallel Agents    | ✅ Yes      | ❌ No        | ❌ No     |
| Provider Switching | ✅ Yes      | N/A          | N/A       |
```

**Pros**:

- ✅ Fastest solution (2-4 hours)
- ✅ Manages user expectations
- ✅ No code changes, no risk

**Cons**:

- ❌ Doesn't deliver what user expected
- ❌ README claims still misleading

**Estimated Effort**: 2-4 hours

---

### Option D: Full Multi-Platform Architecture ⚠️ LARGE SCOPE

**Approach**: Abstract Gofer commands into platform-agnostic format

**Implementation**:

1. Create `GoferCommandProtocol` interface
2. Implement adapters for Claude Code, Copilot, Codex
3. Generate platform-specific command files from single source
4. Add platform detection and capability negotiation

**Pros**:

- ✅ Future-proof architecture
- ✅ Single source of truth for commands
- ✅ Easy to add new platforms

**Cons**:

- ⚠️ Very large scope (80-120 hours)
- ⚠️ High risk, affects all command implementations
- ⚠️ Overkill for current problem

**Estimated Effort**: 80-120 hours

---

## Recommendation

**Phase 1 (Immediate)**: Option C - Fix Documentation ⚡ 2-4 hours

- Update README with capability matrix
- Clarify Feature 027 scope in release notes
- Set correct user expectations

**Phase 2 (Next Sprint)**: Option A - Codex CLI Bridge ⭐ 16-24 hours

- Create skill bridge for Codex CLI
- Enable slash commands in Codex
- Deliver true multi-provider parity

**Phase 3 (Future)**: Option B - Copilot Improvements 📅 24-32 hours

- Enhance Copilot Chat prompts
- Add simulated auto-chaining
- Improve manual workflow experience

**Why This Order**:

1. **Quick win**: Fix documentation immediately (today)
2. **High value**: Codex CLI bridge delivers on user expectations (next week)
3. **Long-term**: Copilot improvements for completeness (backlog)

## Next Steps

1. **User Decision**: Which option(s) to pursue?
2. **If Option A**: Verify Codex CLI is installed and available for testing
3. **If Option C**: Review and approve documentation changes
4. **Create Feature Spec**: For chosen option(s)

## Technical Notes

### Codex CLI Detection

Feature 027 already added health checking:

```typescript
// extension/src/council/providers/cli/CLIHealthChecker.ts
static async checkCodexCLI(): Promise<CLIHealthCheckResult>
```

This can be reused for skill bridge detection.

### Skill Bridge Architecture

Proposed flow:

```
User → Codex CLI → CodexCLIProvider → CodexSkillBridge → Gofer Skill Handler → Response
                                       ↓
                                   Detects /slash command
                                   Routes to appropriate skill
                                   Executes with Codex as provider
```

### Risk Assessment

| Risk                                      | Severity | Mitigation                                      |
| ----------------------------------------- | -------- | ----------------------------------------------- |
| Codex CLI doesn't support routing         | HIGH     | Test early, have fallback plan                  |
| Breaking change to existing Codex users   | LOW      | Feature is additive, backward compatible        |
| Confusion about which commands work where | MEDIUM   | Clear documentation, command availability check |

---

**Questions for User**:

1. Do you have Codex CLI installed? Can you run `codex --version`?
2. Is Codex CLI support a blocker for v1.22.0 adoption?
3. Should we prioritize Codex CLI or Copilot Chat improvements?
4. Is documentation fix acceptable short-term?
