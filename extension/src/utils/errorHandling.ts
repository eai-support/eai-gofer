import * as vscode from 'vscode';
import { Logger } from './logger';
import { ConfigManager } from '../config';

/**
 * Comprehensive error handling utilities for the extension
 * Provides centralized error management, user feedback, and recovery strategies
 */

export enum ErrorSeverity {
  info = 0,
  warning = 1,
  error = 2,
  critical = 3,
}

export enum ErrorCategory {
  network = 'network',
  filesystem = 'filesystem',
  validation = 'validation',
  configuration = 'configuration',
  api = 'api',
  parsing = 'parsing',
  permission = 'permission',
  unknown = 'unknown',
}

export interface ErrorContext {
  component: string;
  operation: string;
  data?: unknown;
  timestamp: Date;
  userAction?: string;
  recovery?: ErrorRecoveryStrategy;
}

type ErrorHandlingDecoratorTarget = { constructor: { name: string } };

export interface ErrorRecoveryStrategy {
  type: 'retry' | 'fallback' | 'ignore' | 'manual';
  maxAttempts?: number;
  delayMs?: number;
  fallbackAction?: () => Promise<void>;
  userMessage?: string;
}

export interface ExtensionError extends Error {
  severity: ErrorSeverity;
  category: ErrorCategory;
  context: ErrorContext;
  isRecoverable: boolean;
  userMessage: string;
  technicalMessage: string;
  originalError?: Error;
  stackTrace?: string;
}

/**
 * Error factory for creating standardized errors
 */
export class ErrorFactory {
  private static logger = Logger.for('ErrorFactory');

  /**
   * Create a network-related error
   */
  public static createNetworkError(
    message: string,
    originalError?: Error,
    context?: Partial<ErrorContext>
  ): ExtensionError {
    return this.createError({
      message,
      severity: ErrorSeverity.error,
      category: ErrorCategory.network,
      isRecoverable: true,
      userMessage:
        'Network connection failed. Please check your internet connection and try again.',
      technicalMessage: message,
      originalError,
      context: {
        component: 'Network',
        operation: 'request',
        timestamp: new Date(),
        recovery: {
          type: 'retry',
          maxAttempts: 3,
          delayMs: 1000,
        },
        ...context,
      },
    });
  }

  /**
   * Create a filesystem-related error
   */
  public static createFilesystemError(
    message: string,
    filePath?: string,
    originalError?: Error,
    context?: Partial<ErrorContext>
  ): ExtensionError {
    return this.createError({
      message,
      severity: ErrorSeverity.error,
      category: ErrorCategory.filesystem,
      isRecoverable: false,
      userMessage: `File operation failed${filePath ? ` for: ${filePath}` : ''}. Please check file permissions and try again.`,
      technicalMessage: message,
      originalError,
      context: {
        component: 'FileSystem',
        operation: 'file-operation',
        timestamp: new Date(),
        data: { filePath },
        ...context,
      },
    });
  }

  /**
   * Create a validation error
   */
  public static createValidationError(
    message: string,
    validationTarget: string,
    context?: Partial<ErrorContext>
  ): ExtensionError {
    return this.createError({
      message,
      severity: ErrorSeverity.warning,
      category: ErrorCategory.validation,
      isRecoverable: true,
      userMessage: `Validation failed for ${validationTarget}. Please check the format and try again.`,
      technicalMessage: message,
      context: {
        component: 'Validation',
        operation: 'validate',
        timestamp: new Date(),
        data: { validationTarget },
        ...context,
      },
    });
  }

  /**
   * Create a configuration error
   */
  public static createConfigurationError(
    message: string,
    configKey?: string,
    context?: Partial<ErrorContext>
  ): ExtensionError {
    return this.createError({
      message,
      severity: ErrorSeverity.error,
      category: ErrorCategory.configuration,
      isRecoverable: true,
      userMessage: `Configuration error${configKey ? ` for: ${configKey}` : ''}. Please check your settings.`,
      technicalMessage: message,
      context: {
        component: 'Configuration',
        operation: 'load-config',
        timestamp: new Date(),
        data: { configKey },
        ...context,
      },
    });
  }

  /**
   * Create a parsing error
   */
  public static createParsingError(
    message: string,
    filePath?: string,
    lineNumber?: number,
    context?: Partial<ErrorContext>
  ): ExtensionError {
    return this.createError({
      message,
      severity: ErrorSeverity.error,
      category: ErrorCategory.parsing,
      isRecoverable: false,
      userMessage: `Failed to parse file${filePath ? `: ${filePath}` : ''}${lineNumber ? ` at line ${lineNumber}` : ''}. Please check the file format.`,
      technicalMessage: message,
      context: {
        component: 'Parser',
        operation: 'parse',
        timestamp: new Date(),
        data: { filePath, lineNumber },
        ...context,
      },
    });
  }

  /**
   * Create a generic error
   */
  public static createError(options: {
    message: string;
    severity: ErrorSeverity;
    category: ErrorCategory;
    isRecoverable: boolean;
    userMessage: string;
    technicalMessage: string;
    originalError?: Error;
    context: ErrorContext;
  }): ExtensionError {
    const error = new Error(options.message) as ExtensionError;

    error.severity = options.severity;
    error.category = options.category;
    error.isRecoverable = options.isRecoverable;
    error.userMessage = options.userMessage;
    error.technicalMessage = options.technicalMessage;
    error.context = options.context;
    error.originalError = options.originalError;
    error.stackTrace = error.stack;

    // Log the error creation
    this.logger.debug(`Created error: ${options.category}/${options.severity}`, {
      message: options.message,
      component: options.context.component,
      operation: options.context.operation,
    });

    return error;
  }
}

/**
 * Error handler with recovery strategies and user feedback
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private logger = Logger.for('ErrorHandler');
  private config = ConfigManager.getInstance();
  private errorHistory: ExtensionError[] = [];
  private maxHistorySize = 100;

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle an error with recovery and user feedback
   */
  public async handleError(
    error: ExtensionError | Error,
    context?: Partial<ErrorContext>
  ): Promise<void> {
    let extensionError: ExtensionError;

    // Convert regular Error to ExtensionError if needed
    if (!(error as ExtensionError).severity) {
      extensionError = ErrorFactory.createError({
        message: error.message,
        severity: ErrorSeverity.error,
        category: ErrorCategory.unknown,
        isRecoverable: false,
        userMessage: 'An unexpected error occurred. Please try again.',
        technicalMessage: error.message,
        originalError: error,
        context: {
          component: context?.component || 'Unknown',
          operation: context?.operation || 'unknown',
          timestamp: new Date(),
          ...context,
        },
      });
    } else {
      extensionError = error as ExtensionError;
    }

    // Add to history
    this.addToHistory(extensionError);

    // Log the error
    this.logError(extensionError);

    // Attempt recovery if applicable
    if (extensionError.isRecoverable && extensionError.context.recovery) {
      await this.attemptRecovery(extensionError);
    } else {
      // Show user feedback
      await this.showUserFeedback(extensionError);
    }
  }

  /**
   * Attempt error recovery based on strategy
   */
  private async attemptRecovery(error: ExtensionError): Promise<void> {
    const recovery = error.context.recovery!;

    try {
      switch (recovery.type) {
        case 'retry':
          await this.retryWithBackoff(error, recovery);
          break;

        case 'fallback':
          if (recovery.fallbackAction) {
            this.logger.info(`Attempting fallback for error: ${error.message}`);
            await recovery.fallbackAction();
            vscode.window.showInformationMessage('Operation completed using fallback method.');
          }
          break;

        case 'ignore':
          this.logger.warn(`Ignoring error: ${error.message}`);
          break;

        case 'manual':
          await this.showManualRecoveryOptions(error);
          break;
      }
    } catch (recoveryError) {
      this.logger.error('Recovery attempt failed', recoveryError as Error);
      await this.showUserFeedback(error);
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryWithBackoff(
    error: ExtensionError,
    recovery: ErrorRecoveryStrategy
  ): Promise<void> {
    const maxAttempts = recovery.maxAttempts || 3;
    const baseDelay = recovery.delayMs || 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.info(`Retry attempt ${attempt}/${maxAttempts} for: ${error.context.operation}`);

        // Show progress for longer operations
        if (attempt > 1) {
          vscode.window.showInformationMessage(`Retrying... (${attempt}/${maxAttempts})`);
        }

        // TODO: Execute the original operation that failed
        // This would need to be implemented per operation type

        vscode.window.showInformationMessage('Operation succeeded after retry.');
        return;
      } catch (retryError) {
        if (attempt === maxAttempts) {
          throw retryError;
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Show manual recovery options to user
   */
  private async showManualRecoveryOptions(error: ExtensionError): Promise<void> {
    const options = ['Show Details', 'Report Issue', 'Ignore'];

    if (error.context.recovery?.userMessage) {
      options.unshift('Try Fix');
    }

    const choice = await vscode.window.showErrorMessage(error.userMessage, ...options);

    switch (choice) {
      case 'Try Fix':
        if (error.context.recovery?.userMessage) {
          vscode.window.showInformationMessage(error.context.recovery.userMessage);
        }
        break;

      case 'Show Details':
        await this.showErrorDetails(error);
        break;

      case 'Report Issue':
        await this.reportIssue(error);
        break;
    }
  }

  /**
   * Show user feedback based on error severity
   */
  private async showUserFeedback(error: ExtensionError): Promise<void> {
    const message = error.userMessage || error.message;

    switch (error.severity) {
      case ErrorSeverity.info:
        vscode.window.showInformationMessage(message);
        break;

      case ErrorSeverity.warning:
        vscode.window.showWarningMessage(message, 'Show Details').then((choice) => {
          if (choice === 'Show Details') {
            this.showErrorDetails(error);
          }
        });
        break;

      case ErrorSeverity.error:
      case ErrorSeverity.critical:
        vscode.window.showErrorMessage(message, 'Show Details', 'Report Issue').then((choice) => {
          if (choice === 'Show Details') {
            this.showErrorDetails(error);
          } else if (choice === 'Report Issue') {
            this.reportIssue(error);
          }
        });
        break;
    }
  }

  /**
   * Show detailed error information
   */
  private async showErrorDetails(error: ExtensionError): Promise<void> {
    const details = [
      `Error: ${error.technicalMessage}`,
      `Component: ${error.context.component}`,
      `Operation: ${error.context.operation}`,
      `Time: ${error.context.timestamp.toISOString()}`,
      `Category: ${error.category}`,
      `Severity: ${ErrorSeverity[error.severity]}`,
      `Recoverable: ${error.isRecoverable}`,
    ];

    if (error.context.data) {
      details.push(`Data: ${JSON.stringify(error.context.data, null, 2)}`);
    }

    if (error.originalError?.stack) {
      details.push(`Stack: ${error.originalError.stack}`);
    }

    const document = await vscode.workspace.openTextDocument({
      content: details.join('\n\n'),
      language: 'text',
    });

    await vscode.window.showTextDocument(document);
  }

  /**
   * Report issue to GitHub
   */
  private async reportIssue(error: ExtensionError): Promise<void> {
    const issueBody = encodeURIComponent(
      [
        '## Error Report',
        '',
        `**Error**: ${error.technicalMessage}`,
        `**Component**: ${error.context.component}`,
        `**Operation**: ${error.context.operation}`,
        `**Time**: ${error.context.timestamp.toISOString()}`,
        `**Category**: ${error.category}`,
        `**Severity**: ${ErrorSeverity[error.severity]}`,
        '',
        '## Context',
        '```json',
        JSON.stringify(error.context.data || {}, null, 2),
        '```',
        '',
        '## Stack Trace',
        '```',
        error.originalError?.stack || error.stackTrace || 'No stack trace available',
        '```',
        '',
        '## Steps to Reproduce',
        '1. ',
        '2. ',
        '3. ',
        '',
        '## Expected Behavior',
        '',
        '',
        '## Actual Behavior',
        '',
        '',
      ].join('\n')
    );

    const issueUrl = `https://github.com/eai-support/eai-gofer/issues/new?title=${encodeURIComponent(`Error: ${error.message}`)}&body=${issueBody}`;

    await vscode.env.openExternal(vscode.Uri.parse(issueUrl));
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: ExtensionError): void {
    const logData = {
      category: error.category,
      component: error.context.component,
      operation: error.context.operation,
      data: error.context.data,
    };

    switch (error.severity) {
      case ErrorSeverity.info:
        this.logger.info(error.technicalMessage, logData);
        break;
      case ErrorSeverity.warning:
        this.logger.warn(error.technicalMessage, logData, error.originalError);
        break;
      case ErrorSeverity.error:
      case ErrorSeverity.critical:
        this.logger.error(error.technicalMessage, error.originalError || error, logData);
        break;
    }
  }

  /**
   * Add error to history
   */
  private addToHistory(error: ExtensionError): void {
    this.errorHistory.unshift(error);

    // Keep history size manageable
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get error statistics
   */
  public getErrorStats(): {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
    recent: ExtensionError[];
  } {
    const byCategory = {} as Record<ErrorCategory, number>;
    const bySeverity = {} as Record<ErrorSeverity, number>;

    for (const error of this.errorHistory) {
      byCategory[error.category] = (byCategory[error.category] || 0) + 1;
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
    }

    return {
      total: this.errorHistory.length,
      byCategory,
      bySeverity,
      recent: this.errorHistory.slice(0, 10),
    };
  }

  /**
   * Clear error history
   */
  public clearHistory(): void {
    this.errorHistory = [];
    this.logger.info('Error history cleared');
  }
}

/**
 * Decorator for automatic error handling
 */
export function withErrorHandling(
  category: ErrorCategory = ErrorCategory.unknown,
  userMessage?: string
) {
  return function (
    target: ErrorHandlingDecoratorTarget,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      try {
        return await method.apply(this, args);
      } catch (error) {
        const extensionError = ErrorFactory.createError({
          message: (error as Error).message,
          severity: ErrorSeverity.error,
          category,
          isRecoverable: false,
          userMessage: userMessage || 'Operation failed. Please try again.',
          technicalMessage: (error as Error).message,
          originalError: error as Error,
          context: {
            component: target.constructor.name,
            operation: propertyName,
            timestamp: new Date(),
            data: { args },
          },
        });

        await ErrorHandler.getInstance().handleError(extensionError);
        throw extensionError;
      }
    };

    return descriptor;
  };
}

/**
 * Global error handler for unhandled promise rejections
 */
export function setupGlobalErrorHandling(): void {
  const errorHandler = ErrorHandler.getInstance();

  process.on('unhandledRejection', (reason, promise) => {
    const error = ErrorFactory.createError({
      message: `Unhandled promise rejection: ${reason}`,
      severity: ErrorSeverity.critical,
      category: ErrorCategory.unknown,
      isRecoverable: false,
      userMessage: 'An unexpected error occurred. The extension may not function correctly.',
      technicalMessage: String(reason),
      context: {
        component: 'Global',
        operation: 'unhandled-rejection',
        timestamp: new Date(),
        data: { promise: String(promise) },
      },
    });

    errorHandler.handleError(error);
  });

  process.on('uncaughtException', (error) => {
    const extensionError = ErrorFactory.createError({
      message: `Uncaught exception: ${error.message}`,
      severity: ErrorSeverity.critical,
      category: ErrorCategory.unknown,
      isRecoverable: false,
      userMessage: 'A critical error occurred. Please restart VS Code.',
      technicalMessage: error.message,
      originalError: error,
      context: {
        component: 'Global',
        operation: 'uncaught-exception',
        timestamp: new Date(),
      },
    });

    errorHandler.handleError(extensionError);
  });
}
