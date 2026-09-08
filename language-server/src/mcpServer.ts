import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation';
import * as path from 'node:path';
import { MCPToolHandler } from './mcp/toolHandler.js';
import { findTool } from './mcp/toolRegistry.js';
import {
  assertToolPermission,
  MCP_TOOL_DEFINITIONS,
  type ToolPermissions,
} from './mcp/toolPolicy.js';
import { WorkspaceAccess } from './mcp/workspaceAccess.js';

export interface StartupOptions extends ToolPermissions {
  workspaceRoot: string;
}

export function parseStartupOptions(args: string[]): StartupOptions {
  const options: StartupOptions = {
    workspaceRoot: '',
    allowWrite: false,
    allowExecution: false,
    allowWorkspaceTools: false,
  };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (seen.has(arg)) throw new Error(`Duplicate startup option: ${arg}`);
    seen.add(arg);
    switch (arg) {
      case '--workspace-root':
        options.workspaceRoot = args[++index] ?? '';
        if (!options.workspaceRoot || options.workspaceRoot.startsWith('--'))
          throw new Error('--workspace-root requires an absolute directory');
        break;
      case '--allow-write':
        options.allowWrite = true;
        break;
      case '--allow-execution':
        options.allowExecution = true;
        break;
      case '--allow-workspace-tools':
        options.allowWorkspaceTools = true;
        break;
      default:
        throw new Error(`Unknown startup option: ${arg}`);
    }
  }
  if (!options.workspaceRoot)
    throw new Error('--workspace-root is required; desktop cwd is not a workspace');
  return options;
}

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

export async function createMcpRuntime(options: StartupOptions) {
  const access = await WorkspaceAccess.create(options.workspaceRoot);
  const server = new Server({ name: 'gofer', version: '0.0.9' }, { capabilities: { tools: {} } });
  const handler = new MCPToolHandler(
    access.root,
    {
      // Custom LSP notifications must not leak onto MCP. No arbitrary handler payloads
      // are logged: they can include user content or security-sensitive paths.
      sendNotification: (method) => {
        process.stderr.write(`[gofer] ${method}\n`);
      },
    },
    access,
    options.allowWorkspaceTools
  );
  const validator = new AjvJsonSchemaValidator();
  const validators = new Map(
    MCP_TOOL_DEFINITIONS.map((tool) => [
      tool.name,
      validator.getValidator(tool.inputSchema as JsonSchemaType),
    ])
  );
  let active = false;
  let closing = false;
  let activeWork: Promise<unknown> | undefined;
  let activeAbort: AbortController | undefined;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: structuredClone(MCP_TOOL_DEFINITIONS),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = findTool(request.params.name);
    if (!tool) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`);
    const args = request.params.arguments ?? {};
    const validation = validators.get(tool.name)!(args);
    if (!validation.valid)
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid arguments for ${tool.name}: ${validation.errorMessage}`
      );
    try {
      assertToolPermission(tool.name, options);
    } catch (error) {
      return toolError((error as Error).message);
    }
    if (closing || active)
      return toolError('Server is closing or busy; retry after the current tool finishes');
    if (extra.signal.aborted) return toolError('Tool call cancelled');
    active = true;
    const abort = new AbortController();
    activeAbort = abort;
    const cancel = () => abort.abort();
    extra.signal.addEventListener('abort', cancel, { once: true });
    handler.setRequestSignal(abort.signal);
    try {
      await access.assertRoot();
      if (closing || abort.signal.aborted) return toolError('Tool call cancelled');
      access.resetBudget();
      if (tool.name === 'gofer_open_artifact') {
        const portablePath = String(args.path).replace(/\\/g, '/');
        const normalized = path.posix.normalize(portablePath);
        if (
          portablePath.split('/').includes('..') ||
          portablePath !== normalized ||
          !/^(?:docs\/|\.specify\/(?:specs|commands)\/|(?:README|AGENTS|CLAUDE|hints)\.md$)/i.test(
            normalized
          )
        ) {
          return toolError(
            'Access denied: only normalized documentation and Gofer spec/command artifact paths are readable'
          );
        }
      }
      activeWork = tool.invoke(handler, args);
      const result = await activeWork;
      if (abort.signal.aborted) return toolError('Tool call cancelled');
      const text = JSON.stringify(result, null, 2);
      if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024)
        return toolError('Tool result exceeds the response limit');
      return {
        content: [{ type: 'text' as const, text }],
        isError:
          !!result && typeof result === 'object' && 'success' in result && result.success === false,
      };
    } catch (error) {
      return toolError(error instanceof Error ? error.message : 'Tool execution failed');
    } finally {
      extra.signal.removeEventListener('abort', cancel);
      handler.setRequestSignal(undefined);
      activeAbort = undefined;
      activeWork = undefined;
      active = false;
    }
  });

  let shutdown: Promise<void> | undefined;
  return {
    server,
    close(): Promise<void> {
      return (shutdown ??= Promise.resolve().then(async () => {
        closing = true;
        activeAbort?.abort();
        await server.close();
        await activeWork?.catch(() => undefined);
        await handler.shutdown();
      }));
    },
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 1 && args[0] === '--help') {
    process.stderr.write(
      'Gofer MCP: --workspace-root ABSOLUTE_DIRECTORY [--allow-write --allow-execution] [--allow-workspace-tools]\nDefault: bounded artifact reads only. Execution requires BOTH narrow flags and can read/write outside the workspace with this process account. --allow-write alone grants no legacy writes: those are not proven workspace-confined. Broad --allow-workspace-tools grants ALL legacy tools, including unbounded reads, non-confined writes and execution. These are trusted host startup decisions, never tool arguments or model approval. This is not an OS sandbox. Cancellation sends SIGTERM, escalates to SIGKILL after 250ms and waits for the direct child to close; descendant cleanup is not guaranteed.\n'
    );
    return;
  }
  const runtime = await createMcpRuntime(parseStartupOptions(args));
  const transport = new StdioServerTransport(process.stdin, process.stdout, {
    maxBufferSize: 1024 * 1024,
  });
  const stop = () => {
    void runtime.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.stdin.once('end', stop);
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  runtime.server.onclose = stop;
  runtime.server.onerror = () => {
    process.stderr.write('[gofer] MCP transport error\n');
  };
  await runtime.server.connect(transport);
  if (process.stdin.readableEnded) stop();
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(
      `Gofer MCP startup failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`
    );
    process.exitCode = 1;
  });
}
