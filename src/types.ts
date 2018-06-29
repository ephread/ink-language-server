import { IConnection, WorkspaceFolder } from "vscode-languageserver";

// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

/** Server configuration. */
export interface InkConfigurationSettings {
    mainStoryPath: string;
    inklecateExecutablePath: string;
    runThroughMono: boolean;
}

export type PartialInkConfigurationSettings = Partial<InkConfigurationSettings>;

/** Thin wrapper around WorkspaceFolder, containing the temporary compile directory. */
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
    MacOs, Windows, Other
}

export interface IConnectionLogger {
    log(message: string): void;
    showErrorMessage(message: string): void;
}

export class InkConnectionLogger implements IConnectionLogger {
    private connection: IConnection;

    constructor(connection: IConnection) {
        this.connection = connection;
    }

    public log(message: string) {
        this.connection.console.log(message);
    }

    public showErrorMessage(message: string) {
        this.connection.window.showErrorMessage(message);
    }
}

/** Extends InkErrorType enum with convenience functions. */
// tslint:disable-next-line:no-namespace
export namespace InkErrorType {
    /**
     * Parses the given string and returns the corresponding `InkErrorType`.
     * If the value could not be found, returns `undefined`.
     * 
     * @param errorType the string to parse. 
     */
    export function parse(errorType: string): InkErrorType | undefined {
        switch(errorType) {
            case "ERROR": return InkErrorType.Error;
            case "WARNING": return InkErrorType.Warning;
            case "RUNTIME ERROR": return InkErrorType.RuntimeError;
            case "RUNTIME WARNING": return InkErrorType.RuntimeWarning;
            case "TODO": return InkErrorType.Todo;
            default: return undefined;
        }
    }
}
