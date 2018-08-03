// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

// tslint:disable:max-classes-per-file
// tslint:disable:no-namespace

import { IConnection, WorkspaceFolder } from "vscode-languageserver/lib/main";

/** Server configuration. */
export interface InkConfigurationSettings {
  mainStoryPath: string;
  inklecateExecutablePath: string;
  runThroughMono: boolean | string;
}

export type PartialInkConfigurationSettings = Partial<InkConfigurationSettings>;

/** Thin wrapper around WorkspaceFolder, containing the temporary compilation directory. */
export interface InkWorkspace {
  folder: WorkspaceFolder;
  temporaryCompilationDirectory?: string;
}

/** Capabilities supported by the client. */
export interface Capabilities {
  configuration: boolean;
  workspaceFolder: boolean;
  diagnostic: boolean;
}

/** Errors types returned by Inklecate. */
export enum InkErrorType {
  Error = "ERROR",
  Warning = "WARNING",
  RuntimeError = "RUNTIME ERROR",
  RuntimeWarning = "RUNTIME WARNING",
  Todo = "TODO"
}

/** Errors returned by Inklecate.  */
export interface InkError {
  type: InkErrorType;
  filePath: string;
  lineNumber: number;
  message: string;
}

export enum Platform {
  MacOs,
  Windows,
  Other
}

export namespace Platform {
    export function name(platform: Platform): string {
        switch(platform) {
            case 0: return 'macOS';
            case 1: return 'Windows';
            default: return 'other';
        }
    }
}

export interface IConnectionLogger {
  console: IConsoleLogger;
  showErrorMessage(message: string, shouldLog: boolean): void;
  showWarningMessage(message: string, shouldLog: boolean): void;
  showInformationMessage(message: string, shouldLog: boolean): void;

  reportServerError(): void;
}

export interface IConsoleLogger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  log(message: string): void;
}

export class InkConnectionLogger implements IConnectionLogger {
  public console: IConsoleLogger;

  private connection: IConnection;
  private verbose: boolean = false;

  constructor(connection: IConnection, verbose: boolean = true) {
    this.connection = connection;
    this.console = new InkConsoleLogger(connection, verbose);
    this.verbose = verbose;
  }

  public showErrorMessage(message: string, shouldLog: boolean = true) {
    if (shouldLog) {
      this.connection.console.error(message);
    }

    this.connection.window.showErrorMessage(message);
  }

  public showWarningMessage(message: string, shouldLog: boolean = true) {
    if (shouldLog) {
      this.connection.console.warn(message);
    }

    this.connection.window.showWarningMessage(message);
  }

  public showInformationMessage(message: string, shouldLog: boolean = true) {
    if (shouldLog && this.verbose) {
      this.connection.console.info(message);
    }

    this.connection.window.showInformationMessage(message);
  }

  /**
   * Show a generic server error in the client.
   */
  public reportServerError() {
    this.showErrorMessage(
      "An unrecoverable error occured with Ink Language Server. " +
      "Please see the logs for more information.",
      false
    );
  }
}

export class InkConsoleLogger implements IConsoleLogger {
  private connection: IConnection;
  private verbose: boolean = false;

  constructor(connection: IConnection, verbose: boolean = true) {
    this.connection = connection;
    this.verbose = verbose;
  }

  public error(message: string): void {
    this.connection.console.error(message);
  }

  public warn(message: string): void {
    this.connection.console.warn(message);
  }

  public info(message: string): void {
    if (!this.verbose) { return; }
    this.connection.console.info(message);
  }

  public log(message: string): void {
    if (!this.verbose) { return; }
    this.connection.console.log(message);
  }
}

/** Extends InkErrorType enum with convenience functions. */
export namespace InkErrorType {
  /**
   * Parses the given string and returns the corresponding `InkErrorType`.
   * If the value could not be found, returns `undefined`.
   *
   * @param errorType the string to parse.
   */
  export function parse(errorType: string): InkErrorType | undefined {
    switch (errorType) {
      case "ERROR":
        return InkErrorType.Error;
      case "WARNING":
        return InkErrorType.Warning;
      case "RUNTIME ERROR":
        return InkErrorType.RuntimeError;
      case "RUNTIME WARNING":
        return InkErrorType.RuntimeWarning;
      case "TODO":
        return InkErrorType.Todo;
      default:
        return undefined;
    }
  }
}

export interface DocumentPathAndWorkspace {
  documentPath: string;
  workspace: InkWorkspace;
}

export interface RuntimeChoice {
  index: number;
  text: string;
}

/**
 * Parameters sent with the `inkWorkspace/didCompileStory` notification.
 */
export interface DidCompileStoryParams {
  /** Uri of the current workspace (in which the compilation happened). */
  workspaceUri: string;

  /** Uri of the compiled story, a JSON file. */
  storyUri: string;
}

export interface RuntimeTextParams {
  text: string;
}

export interface RuntimeTagParams {
  tags: string[];
}

export interface RuntimeChoicesParams {
  choice: RuntimeChoice;
}

export interface RuntimeErrorParams {
  error: string;
}
