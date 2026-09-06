import * as vscode from 'vscode';
import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const TOOL_NAME = 'gofer_execute_stage';
const COMMAND_NAME = 'gofer.executeStage';
const NATIVE_VENDOR = 'copilot';
const MAX_BYTES = 1024 * 1024;
const MAX_CALL_MS = 120_000;
const MAX_STAGE_MS = 600_000;
const MAX_RESULT_BYTES = 8 * MAX_BYTES;
const MAX_NATIVE_TOOL_CALLS = 2;

// Shared across tool types/instances in this extension host. Reject excess calls
// instead of retaining an unbounded queue. This is not task-wide budget accounting:
// the request protocol has no trusted task identity or cumulative allowance.
let activeNativeToolCalls = 0;

interface NativeAdmission {
  track<T>(action: () => Promise<T>): Promise<T>;
  release(): void;
}

function admitNativeToolCall(token: vscode.CancellationToken): NativeAdmission {
  if (token.isCancellationRequested) {
    throw cancelled();
  }
  if (activeNativeToolCalls >= MAX_NATIVE_TOOL_CALLS) {
    throw Object.assign(
      new Error('Gofer native tools are busy. Retry after an active call finishes.'),
      { stageReason: 'native_tool_busy' }
    );
  }
  activeNativeToolCalls += 1;
  let released = false;
  let wrapperFinished = false;
  let pending = 0;
  const releaseIfIdle = () => {
    if (wrapperFinished && pending === 0 && !released) {
      released = true;
      activeNativeToolCalls -= 1;
    }
  };
  return {
    track<T>(action: () => Promise<T>): Promise<T> {
      if (wrapperFinished) {
        return Promise.reject(cancelled());
      }
      pending += 1;
      return Promise.resolve()
        .then(action)
        .finally(() => {
          pending -= 1;
          releaseIfIdle();
        });
    },
    release() {
      // Cancellation completes the wrapper, not an uncancellable native call.
      wrapperFinished = true;
      releaseIfIdle();
    },
  };
}

export interface StageToolInput {
  request: Record<string, unknown>;
}

interface Bounds {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

// The extension still targets 1.93 typings. Keep the newer stable API at this
// narrow structural boundary, and require its presence before native execution.
interface ToolOptions {
  input: StageToolInput;
  toolInvocationToken?: unknown;
  tokenizationOptions?: {
    tokenBudget: number;
    countTokens(text: string, token?: vscode.CancellationToken): Thenable<number>;
  };
}

interface TextPart {
  value: string;
}

interface ToolResult {
  content: TextPart[];
}

interface NativeAPI {
  LanguageModelTextPart: new (value: string) => TextPart;
  LanguageModelDataPart?: new (...args: never[]) => { data: Uint8Array; mimeType: string };
  LanguageModelThinkingPart?: new (...args: never[]) => {
    value: string | string[];
    id?: string;
    metadata?: Record<string, unknown>;
  };
  LanguageModelToolResult: new (content: TextPart[]) => ToolResult;
  lm: typeof vscode.lm & {
    registerTool(
      name: string,
      tool: StageExecutionTool | StageModelDiscoveryTool
    ): vscode.Disposable;
    invokeTool(
      name: string,
      options: ToolOptions,
      token?: vscode.CancellationToken
    ): Thenable<ToolResult>;
  };
}

function nativeAPI(): NativeAPI {
  const api = vscode as unknown as NativeAPI;
  if (
    typeof api.lm?.selectChatModels !== 'function' ||
    typeof api.lm.registerTool !== 'function' ||
    typeof api.lm.invokeTool !== 'function' ||
    typeof api.LanguageModelTextPart !== 'function' ||
    typeof api.LanguageModelToolResult !== 'function'
  ) {
    throw new Error(
      'Gofer stage execution requires VS Code native language model tools. No CLI fallback is allowed.'
    );
  }
  return api;
}

function trustedRoot(): string {
  if (!vscode.workspace.isTrusted) {
    throw new Error('Gofer stage execution requires a trusted workspace.');
  }
  const folders = vscode.workspace.workspaceFolders;
  if (folders?.length !== 1 || folders[0].uri.scheme !== 'file') {
    throw new Error('Open exactly one filesystem workspace folder for Gofer stage execution.');
  }
  return folders[0].uri.fsPath;
}

function limit(value: number | undefined, maximum: number): number {
  if (value === undefined) {
    return maximum;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Invalid Gofer execution limit.');
  }
  return Math.min(value, maximum);
}

function assertBytes(text: string, maximum: number): void {
  if (Buffer.byteLength(text, 'utf8') > maximum) {
    throw new Error('Gofer output exceeds the byte limit.');
  }
}

interface Operation {
  token: vscode.CancellationToken;
  signal: AbortSignal;
  check(): void;
}

function cancelled(): vscode.CancellationError {
  return Object.assign(new vscode.CancellationError(), { stageReason: 'cancelled' });
}

async function bounded<T>(
  signal: AbortSignal | undefined,
  timeoutMs: number,
  action: (operation: Operation) => Promise<T>,
  admission?: NativeAdmission
): Promise<T> {
  const source = new vscode.CancellationTokenSource();
  const controller = new AbortController();
  let stopped: Error | undefined;
  let rejectStop!: (reason: Error) => void;
  const stopPromise = new Promise<never>((_resolve, reject) => {
    rejectStop = reject;
  });
  const stop = (reason: Error): void => {
    if (stopped) {
      return;
    }
    stopped = reason;
    controller.abort();
    source.cancel();
    rejectStop(reason);
  };
  const onAbort = (): void => stop(cancelled());
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(
    () =>
      stop(
        Object.assign(new Error('Gofer stage execution timed out.'), {
          stageReason: 'time_limit',
        })
      ),
    timeoutMs
  );
  const operation: Operation = {
    token: source.token,
    signal: controller.signal,
    check: () => {
      if (stopped) {
        throw stopped;
      }
    },
  };
  try {
    if (signal?.aborted) {
      onAbort();
    }
    const work = () => {
      operation.check();
      return action(operation);
    };
    return await Promise.race([
      stopPromise,
      admission ? admission.track(work) : Promise.resolve().then(work),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    // Cancel even on output/protocol errors, not just caller cancellation.
    stopped ??= cancelled();
    controller.abort();
    source.cancel();
    source.dispose();
  }
}

function isNativeCompound(model: vscode.LanguageModelChat): boolean {
  const metadata = model as vscode.LanguageModelChat & { nativeCompound?: unknown };
  if (metadata.nativeCompound !== undefined && typeof metadata.nativeCompound !== 'boolean') {
    throw new Error('Native model catalog contains invalid compound metadata.');
  }
  // Auto routes inside the host. Keep that current path even if a provider
  // reports false; never infer a concrete family or compound status from substrings.
  return (
    metadata.nativeCompound === true ||
    [model.id, model.family, model.name].some(
      (value) => typeof value === 'string' && value.trim().toLowerCase() === 'auto'
    )
  );
}

// This surface serves native VS Code Copilot only. CLI-backed and other
// providers are not interchangeable, even when they advertise the same model ID.
export class VSCodeStageAdapter {
  readonly host = 'vscode' as const;
  readonly surface = 'vscode-extension' as const;

  constructor(
    private readonly root: string,
    private readonly access: vscode.LanguageModelAccessInformation,
    private readonly admission?: NativeAdmission
  ) {}

  private check(operation: Operation): void {
    operation.check();
    if (trustedRoot() !== this.root) {
      throw new Error('The Gofer workspace changed during execution.');
    }
  }

  async discover(options: Bounds = {}) {
    const api = nativeAPI();
    const maxBytes = limit(options.maxOutputBytes, MAX_BYTES);
    return bounded(
      options.signal,
      limit(options.timeoutMs, MAX_CALL_MS),
      async (operation) => {
        this.check(operation);
        const nativeModels = await api.lm.selectChatModels({ vendor: NATIVE_VENDOR });
        this.check(operation);
        const ids = new Set<string>();
        let bytes = 0;
        const models = nativeModels.map((model) => {
          if (model.vendor !== NATIVE_VENDOR) {
            throw new Error('Native Copilot catalog returned a different vendor.');
          }
          if (!model.id || !model.family || ids.has(model.id)) {
            throw new Error('Native model catalog contains missing or ambiguous identities.');
          }
          ids.add(model.id);
          const entry = {
            id: model.id,
            family: model.family,
            available: true as const,
            nativeCompound: isNativeCompound(model),
          };
          bytes += Buffer.byteLength(JSON.stringify(entry), 'utf8');
          if (bytes > maxBytes) {
            throw new Error('Gofer model catalog exceeds the byte limit.');
          }
          return entry;
        });
        const result = {
          host: this.host,
          surface: this.surface,
          verified: true as const,
          observedAtMs: Date.now(),
          readOnlyIsolation: true as const,
          reportedModelIdentity: false,
          reviewGuidance:
            'Use peer-review for an independent second execution, with maxAttempts=3 for the terminal validation step (two model calls). Required verified different-family critique is unsupported here: native selection is available, but backend identity is not returned. Do not downgrade a required critique. Cost and quality rankings are unknown; do not infer them from model names.',
          models,
        };
        assertBytes(JSON.stringify(result), maxBytes);
        return result;
      },
      this.admission
    );
  }

  async execute(
    options: Bounds & {
      modelId: string;
      prompt: string;
      readOnly?: boolean;
      maxCostUsd?: number | null;
    }
  ) {
    const api = nativeAPI();
    const maxBytes = limit(options.maxOutputBytes, MAX_BYTES);
    if (
      options.readOnly === false ||
      (options.maxCostUsd !== undefined && options.maxCostUsd !== null)
    ) {
      throw new Error(
        'Gofer native execution is read-only and cannot enforce a hard dollar limit.'
      );
    }
    if (
      typeof options.modelId !== 'string' ||
      !options.modelId.trim() ||
      typeof options.prompt !== 'string'
    ) {
      throw new Error('An exact native model ID and text prompt are required.');
    }
    assertBytes(options.prompt, MAX_BYTES);
    return bounded(
      options.signal,
      limit(options.timeoutMs, MAX_CALL_MS),
      async (operation) => {
        this.check(operation);
        // Re-query for every leg. Never substitute the first/default model or a CLI.
        const models = await api.lm.selectChatModels({
          vendor: NATIVE_VENDOR,
          id: options.modelId,
        });
        this.check(operation);
        if (models.some((model) => model.vendor !== NATIVE_VENDOR)) {
          throw new Error('Native Copilot selection returned a different vendor.');
        }
        const matches = models.filter((model) => model.id === options.modelId);
        if (matches.length !== 1) {
          throw new Error('The exact requested native model is unavailable or ambiguous.');
        }
        const model = matches[0];
        if (this.access.canSendRequest(model) === false) {
          throw new Error('Native model consent was denied.');
        }
        const message = vscode.LanguageModelChatMessage.User(options.prompt);
        const inputTokens = await model.countTokens(message, operation.token);
        this.check(operation);
        if (
          !Number.isSafeInteger(inputTokens) ||
          inputTokens < 0 ||
          !Number.isSafeInteger(model.maxInputTokens) ||
          model.maxInputTokens <= 0 ||
          inputTokens > model.maxInputTokens
        ) {
          throw new Error(
            'Gofer prompt exceeds or cannot verify the native model input token limit.'
          );
        }
        const requestOptions: vscode.LanguageModelChatRequestOptions & { tools: never[] } = {
          justification:
            'Run a Gofer read-only proposal using the approved additional-model route.',
          tools: [],
        };
        const response = await model.sendRequest([message], requestOptions, operation.token);
        this.check(operation);
        const stream = (response as unknown as { stream?: AsyncIterable<unknown> }).stream;
        if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
          throw Object.assign(
            new Error('Native response has no inspectable stream; refusing text-only fallback.'),
            { stageReason: 'native_response_stream_unavailable' }
          );
        }
        let text = '';
        let bytes = 0;
        for await (const part of stream) {
          this.check(operation);
          // Copilot emits bookkeeping records alongside text. Never decode,
          // replay or save these opaque records, and never accept arbitrary data.
          if (
            typeof api.LanguageModelDataPart === 'function' &&
            part instanceof api.LanguageModelDataPart &&
            (part.mimeType === 'usage' || part.mimeType === 'stateful_marker')
          ) {
            if (!(part.data instanceof Uint8Array)) {
              throw new Error('Malformed native bookkeeping part.');
            }
            bytes += part.data.byteLength;
            if (bytes > maxBytes) {
              throw new Error('Gofer output exceeds the byte limit.');
            }
            continue;
          }
          // New hosts can send reasoning parts. Bound and discard them, never
          // expose internal reasoning as a proposal or relax tool-call checks.
          if (
            typeof api.LanguageModelThinkingPart === 'function' &&
            part instanceof api.LanguageModelThinkingPart
          ) {
            if (
              !(
                typeof part.value === 'string' ||
                (Array.isArray(part.value) &&
                  part.value.every((value) => typeof value === 'string'))
              ) ||
              (part.id !== undefined && typeof part.id !== 'string') ||
              (part.metadata !== undefined &&
                (part.metadata === null ||
                  typeof part.metadata !== 'object' ||
                  Array.isArray(part.metadata)))
            ) {
              throw new Error('Malformed native reasoning part.');
            }
            bytes += Buffer.byteLength(
              JSON.stringify({ value: part.value, id: part.id, metadata: part.metadata }),
              'utf8'
            );
            if (bytes > maxBytes) {
              throw new Error('Gofer output exceeds the byte limit.');
            }
            continue;
          }
          if (!(part instanceof api.LanguageModelTextPart) || typeof part.value !== 'string') {
            const types = vscode as unknown as Record<string, unknown>;
            const isNativePart = (name: string) =>
              typeof types[name] === 'function' &&
              part instanceof (types[name] as new (...args: never[]) => object);
            const stageReason = isNativePart('LanguageModelToolCallPart')
              ? 'native_tool_call_blocked'
              : isNativePart('LanguageModelDataPart')
                ? 'native_data_part_blocked'
                : 'native_unknown_part_blocked';
            throw Object.assign(
              new Error(
                'Native tool-call or non-text output is forbidden for read-only stage execution.'
              ),
              { stageReason }
            );
          }
          bytes += Buffer.byteLength(part.value, 'utf8');
          if (bytes > maxBytes) {
            throw new Error('Gofer output exceeds the byte limit.');
          }
          text += part.value;
        }
        this.check(operation);
        return { text, selectedModelId: model.id, reportedModelId: null, usage: {} };
      },
      this.admission
    );
  }
}

export interface StageRuntime {
  executeStage(
    request: Record<string, unknown>,
    options: {
      root: string;
      adapter: VSCodeStageAdapter;
      signal: AbortSignal;
    }
  ): Promise<unknown>;
}

export async function loadBundledStageRuntime(extensionUri: vscode.Uri): Promise<StageRuntime> {
  if (extensionUri.scheme !== 'file') {
    throw new Error('Gofer requires a filesystem extension installation.');
  }
  const root = await realpath(extensionUri.fsPath);
  let resource: string;
  try {
    resource = await realpath(
      path.join(root, 'resources', 'node-scripts', 'lib', 'stage-execution.mjs')
    );
  } catch {
    throw new Error(
      'Bundled Gofer stage runtime is missing. Sync and package extension resources; workspace JavaScript will not be loaded.'
    );
  }
  const relative = path.relative(root, resource);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Gofer stage runtime must remain inside the trusted extension installation.');
  }
  // Preserve native ESM loading in the CommonJS webpack bundle. This URL is
  // derived only from ExtensionContext, never request data or the workspace.
  const runtime = (await import(
    /* webpackIgnore: true */ pathToFileURL(resource).href
  )) as StageRuntime;
  if (typeof runtime.executeStage !== 'function') {
    throw new Error('Bundled Gofer runtime does not export executeStage.');
  }
  return runtime;
}

function snapshotInput(input: StageToolInput): StageToolInput {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => key !== 'request') ||
    !input.request ||
    typeof input.request !== 'object' ||
    Array.isArray(input.request)
  ) {
    throw new Error('Gofer tool input must be { request: object }.');
  }
  const json = JSON.stringify(input);
  assertBytes(json, MAX_BYTES);
  const snapshot = JSON.parse(json) as StageToolInput;
  if (snapshot.request.host !== 'vscode' || snapshot.request.surface !== 'vscode-extension') {
    throw new Error('Gofer stage request must target vscode / vscode-extension.');
  }
  return snapshot;
}

export class StageExecutionTool implements vscode.Disposable {
  private readonly active = new Set<AbortController>();
  private disposed = false;

  constructor(
    private readonly context: Pick<
      vscode.ExtensionContext,
      'extensionUri' | 'languageModelAccessInformation'
    >,
    private readonly loadRuntime = loadBundledStageRuntime
  ) {}

  prepareInvocation(options: { input: StageToolInput }, token: vscode.CancellationToken) {
    if (token.isCancellationRequested) {
      throw cancelled();
    }
    const root = trustedRoot();
    const { request } = snapshotInput(options.input);
    const message = new vscode.MarkdownString();
    message.appendText(
      `Run Gofer stage ${String(request.stage)} in ${root}?\n\n` +
        'This may send the task and the listed context files to additional models on your current native VS Code Copilot account (vendor copilot only). ' +
        'The requested route can make multiple separate requests, including review or escalation, within the policy limits. ' +
        'Those limits apply to this invocation only, not a cumulative task budget. Native tools admit at most two concurrent calls in this extension host. ' +
        'These calls may consume paid quota or incur additional charges. VS Code does not provide a verified price or ' +
        'cost ceiling here; a dollar limit cannot be guaranteed when native usage is unreported. ' +
        'Each call is tool-less and returns read-only proposals. No edits, commands, automatic application, or completion claims are authorized.\n\n' +
        `Requested policy (not proof of approval): ${JSON.stringify(request.policy)}\n` +
        `Context file paths: ${JSON.stringify(request.context)}`
    );
    return {
      invocationMessage: 'Running Gofer read-only stage proposals with native models',
      confirmationMessages: { title: 'Approve Gofer additional-model requests', message },
    };
  }

  async invoke(options: ToolOptions, token: vscode.CancellationToken): Promise<ToolResult> {
    if (this.disposed) {
      throw new Error('Gofer stage tool is disposed.');
    }
    const api = nativeAPI();
    const root = trustedRoot();
    const { request } = snapshotInput(options.input);
    const admission = admitNativeToolCall(token);
    const controller = new AbortController();
    this.active.add(controller);
    let subscription: vscode.Disposable | undefined;
    try {
      subscription = token.onCancellationRequested(() => controller.abort());
      if (token.isCancellationRequested) {
        controller.abort();
      }
      return await bounded(
        controller.signal,
        MAX_STAGE_MS,
        async (operation) => {
          const runtime = await this.loadRuntime(this.context.extensionUri);
          operation.check();
          if (trustedRoot() !== root) {
            throw new Error('The Gofer workspace changed before execution.');
          }
          const result = await runtime.executeStage(request, {
            root,
            adapter: new VSCodeStageAdapter(
              root,
              this.context.languageModelAccessInformation,
              admission
            ),
            signal: operation.signal,
          });
          operation.check();
          // The engine owns validation and routing. Its output is never applied.
          const text = JSON.stringify(result);
          if (typeof text !== 'string') {
            throw new Error('Bundled Gofer engine returned no serializable result.');
          }
          assertBytes(text, MAX_RESULT_BYTES);
          if (options.tokenizationOptions) {
            const { tokenBudget, countTokens } = options.tokenizationOptions;
            const tokens = await countTokens(text, operation.token);
            operation.check();
            if (
              !Number.isSafeInteger(tokenBudget) ||
              tokenBudget < 0 ||
              !Number.isSafeInteger(tokens) ||
              tokens < 0 ||
              tokens > tokenBudget
            ) {
              throw new Error(
                'Gofer result exceeds or cannot verify the tool response token budget.'
              );
            }
          }
          return new api.LanguageModelToolResult([new api.LanguageModelTextPart(text)]);
        },
        admission
      );
    } finally {
      controller.abort();
      subscription?.dispose();
      this.active.delete(controller);
      admission.release();
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const controller of this.active) {
      controller.abort();
    }
    this.active.clear();
  }
}

const registrations = new WeakMap<vscode.ExtensionContext, vscode.Disposable>();

/** Native catalogue access for chat, without model execution or file access. */
export class StageModelDiscoveryTool implements vscode.Disposable {
  private readonly active = new Set<AbortController>();
  private disposed = false;

  constructor(private readonly access: vscode.LanguageModelAccessInformation) {}

  async invoke(
    options: {
      input: Record<string, never>;
      tokenizationOptions?: ToolOptions['tokenizationOptions'];
    },
    token: vscode.CancellationToken
  ): Promise<ToolResult> {
    if (this.disposed) {
      throw new Error('Gofer discovery tool is disposed.');
    }
    if (
      !options.input ||
      typeof options.input !== 'object' ||
      Array.isArray(options.input) ||
      Object.keys(options.input).length !== 0
    ) {
      throw new Error('Gofer discovery input must be {}.');
    }
    const root = trustedRoot();
    const admission = admitNativeToolCall(token);
    const controller = new AbortController();
    this.active.add(controller);
    let subscription: vscode.Disposable | undefined;
    try {
      subscription = token.onCancellationRequested(() => controller.abort());
      if (token.isCancellationRequested) {
        controller.abort();
      }
      return await bounded(
        controller.signal,
        MAX_CALL_MS,
        async (operation) => {
          operation.check();
          const catalog = await new VSCodeStageAdapter(root, this.access, admission).discover({
            signal: operation.signal,
          });
          const text = JSON.stringify({
            ...catalog,
            inferencePerformed: false,
            canClaimDone: false,
          });
          if (options.tokenizationOptions) {
            const { tokenBudget, countTokens } = options.tokenizationOptions;
            const count = await countTokens(text, operation.token);
            operation.check();
            if (
              !Number.isSafeInteger(tokenBudget) ||
              tokenBudget < 0 ||
              !Number.isSafeInteger(count) ||
              count < 0 ||
              count > tokenBudget
            ) {
              throw new Error(
                'Gofer discovery exceeds or cannot verify the response token budget.'
              );
            }
          }
          operation.check();
          if (trustedRoot() !== root) {
            throw new Error('The Gofer workspace changed during discovery.');
          }
          const api = nativeAPI();
          return new api.LanguageModelToolResult([new api.LanguageModelTextPart(text)]);
        },
        admission
      );
    } finally {
      controller.abort();
      subscription?.dispose();
      this.active.delete(controller);
      admission.release();
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const controller of this.active) {
      controller.abort();
    }
    this.active.clear();
  }
}

export function registerStageExecutionTool(context: vscode.ExtensionContext): void {
  if (registrations.has(context)) {
    return;
  }
  const tool = new StageExecutionTool(context);
  const discovery = new StageModelDiscoveryTool(context.languageModelAccessInformation);
  const disposables: vscode.Disposable[] = [tool, discovery];
  try {
    // Old hosts may still activate Gofer; the hidden command explains the
    // unsupported native surface instead of granting a fallback execution path.
    if (typeof (vscode as unknown as NativeAPI).lm?.registerTool === 'function') {
      disposables.push(nativeAPI().lm.registerTool(TOOL_NAME, tool));
      disposables.push(nativeAPI().lm.registerTool('gofer_discover_models', discovery));
    }
    disposables.push(
      vscode.commands.registerCommand(
        COMMAND_NAME,
        (input: StageToolInput, token?: vscode.CancellationToken) => {
          trustedRoot();
          // Always go through VS Code preparation/confirmation, never call invoke
          // directly and never treat policy.approved from JSON as user consent.
          return nativeAPI().lm.invokeTool(
            TOOL_NAME,
            {
              input: snapshotInput(input),
              toolInvocationToken: undefined,
            },
            token
          );
        }
      )
    );
  } catch (error) {
    for (const disposable of disposables.reverse()) {
      disposable.dispose();
    }
    throw error;
  }
  const registration = new vscode.Disposable(() => {
    for (const disposable of disposables.reverse()) {
      disposable.dispose();
    }
    registrations.delete(context);
  });
  registrations.set(context, registration);
  context.subscriptions.push(registration);
}
