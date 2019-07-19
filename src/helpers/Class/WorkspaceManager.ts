// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as Path from "path";

import {
  DidChangeWatchedFilesParams,
  ExecuteCommandParams,
  FileChangeType,
  InitializeParams,
  TextDocument,
  WorkspaceFolder
} from "vscode-languageserver/lib/main";

import URI from "vscode-uri/lib/umd";

import { IConnection } from "vscode-languageserver/lib/main";

import { IInkCompiler } from "../../types/backend";
import {
  Capabilities,
  DocumentPathAndWorkspace,
  IConnectionLogger,
  InkWorkspace,
  PartialInkConfigurationSettings
} from "../../types/types";

import { getDefaultSettings, mergeSettings } from "../configuration";
import { isFilePathChildOfDirPath } from "../utils";

import CompilationDirectoryManager from "./CompilationDirectoryManager";
import DocumentManager from "./DocumentManager";

/**
 * Manages the local workspaces, mirroring the workspaces handled by the client.
 */
export default class WorkspaceManager {
  /**
   * Workspace directories managed by the server,
   * mapped from the workspace managed by the client.
   *
   * URIs of the client's `WorkspaceFolder` will be used as keys.
   */
  public workspaceDirectories: Map<string, InkWorkspace> = new Map();

  /** Capabilities defined by the client. Defaults to none. */
  public capabilities: Capabilities = {
    configuration: false,
    workspaceFolder: false,
    diagnostic: false
  };

  public rootUri: string|null = null;

  public initializationOptions: PartialInkConfigurationSettings = {};

  public canCompile = false;

  constructor(
    private connection: IConnection,
    private documentManager: DocumentManager,
    private compilationDirectoryManager: CompilationDirectoryManager,
    private compiler: IInkCompiler,
    private logger: IConnectionLogger
  ) {}

  public initialize(params: InitializeParams) {
    if (params.capabilities.workspace) {
      this.capabilities.configuration = !!params.capabilities.workspace.configuration;
      this.capabilities.workspaceFolder = !!params.capabilities.workspace.workspaceFolders;

      if (params.capabilities.textDocument) {
        this.capabilities.diagnostic = !!params.capabilities.textDocument.publishDiagnostics;
      }
    }

    if (params.rootUri) {
      this.rootUri = params.rootUri;
    } else if (params.rootPath) {
      // This handles a few corner cases when converting to a URI from
      // a path such as C:\My Documents\foo.txt to file:///c/my%20documents/foo.txt
      this.rootUri = URI.file(params.rootPath).toString();
    }

    if (params.initializationOptions && params.initializationOptions.ink) {
      this.initializationOptions = params.initializationOptions.ink;
    }
  }

  /**
   * Returns the InkWorkspace of the given document. If no workspace could be found,
   * returns `undefined`.
   *
   * Since Inklecate requires as a full compilation of the entire related project
   * to push diagnostics, the workspace of each document must be known.
   *
   * @param document a text document, belonging to the returned workspace.
   */
  public getInkWorkspaceOfDocument(document: TextDocument): InkWorkspace | undefined {
    const documentPath = URI.parse(document.uri).fsPath;
    return this.getInkWorkspaceOfFilePath(documentPath);
  }

  /**
   * Returns the InkWorkspace of the given uri. If no workspace could be
   * found, returns `undefined`.
   *
   * Since Inklecate requires as a full compilation of the entire related project
   * to push diagnostics, the workspace of each document must be known.
   *
   * @param document a text document, belonging to the returned workspace.
   */
  public getInkWorkspaceOfFilePath(documentPath: string): InkWorkspace | undefined {
    for (const workspaceKey of this.workspaceDirectories.keys()) {
      const workspace = this.workspaceDirectories.get(workspaceKey);
      if (!workspace) {
        continue;
      }

      const workspacePath = URI.parse(workspace.folder.uri).fsPath;
      if (isFilePathChildOfDirPath(documentPath, workspacePath)) {
        return workspace;
      }
    }

    return undefined;
  }

  /**
   * Based on a list of workspace folders from the client, create temporary directories
   * that ink will use to compile the project
   */
  public async setupWorkspaceCopy(workspaceFolders: Array<WorkspaceFolder>|null) {
    if (workspaceFolders) {
      const hrstart = process.hrtime();
      const promises: Array<Promise<string | void>> = [];
      for (const workspaceFolder of workspaceFolders) {
        promises.push(
          this.compilationDirectoryManager
            .prepareTempDirectoryForCompilation(workspaceFolder)
            .then(tempDir => {
              if (tempDir) {
                this.logger.console.info(
                  `Temporary compilation directory successfully created at: ${tempDir}`
                );
                let workspace = this.workspaceDirectories.get(workspaceFolder.uri);

                if (!workspace) {
                  workspace = {
                    folder: workspaceFolder
                  };

                  this.workspaceDirectories.set(workspaceFolder.uri, workspace);
                }

                workspace.temporaryCompilationDirectory = tempDir;

                this.canCompile = true;
              } else {
                this.logger.console.error(`'tempDir' should have been set, but was undefined.`);
                this.logger.reportServerError();
              }
            })
            .catch(() => {
              this.logger.reportServerError();
            })
        );
      }

      Promise.all(promises).then(() => {
        const hrend = process.hrtime(hrstart);
        const time = (hrend[0] * 1e9 + hrend[1]) / 1e9;
        this.logger.console.info(
          `All temporary compilation directories were created in ${time}s.`
        );
      });
    }
  }

  /**
   * Initialize workspaces by fetching opened `WorkspaceFolder` from the client and
   * creating the temporary directories which will hold copies of the Ink Project.
   * If the client does not support workspaces, presume that the rootUri is a single workspace.
   */
  public async initializeInkWorkspaces() {
    if (this.capabilities.workspaceFolder) {
      return this.connection.workspace.getWorkspaceFolders().then(
        workspaceFolders => {
          return this.setupWorkspaceCopy(workspaceFolders);
        },
        () => {
          return Promise.reject();
        }
      );
    } else if (this.rootUri) {
      let folder = {} as WorkspaceFolder;
      folder.uri = this.rootUri;
      // for some uri file:///path/to/file, name becomes 'file'
      folder.name = this.rootUri.split('/').slice(-1)[0];
      return this.setupWorkspaceCopy([folder]);
    }
  }

  /**
   * Update the content of the given document, in the temporary copy of the workspace,
   * and compile the project.
   *
   * @param document the document to update.
   */
  public async updateDocumentAndCompileWorkspace(document: TextDocument) {
    if (!this.canCompile) {
      this.logger.console.info(
        "The workspace is not ready yet, try compiling again in a few seconds…"
      );
      return;
    }

    let workspace = this.getInkWorkspaceOfDocument(document);
    if (!workspace) {
      this.logger.console.warn("The temporary workspace does not exist, attempting to restore…");
      await this.initializeInkWorkspaces();

      workspace = this.getInkWorkspaceOfDocument(document);

      if (!workspace) {
        const basename = Path.basename(document.uri);
        const message = `The temporary workspace is missing or ${basename} is not in the workspace.`;
        this.logger.console.error(message);
        return;
      }
    }

    // Merge from the most specific settings -> least specific
    let documentSettings = await this.fetchDocumentConfigurationSettings(document);
    let defaultSettings = getDefaultSettings();
    let settings = mergeSettings(documentSettings, this.initializationOptions);
    settings = mergeSettings(settings, defaultSettings);

    this.compilationDirectoryManager.updateFile(document, workspace).then(
      () => {
        this.compiler.compileStory(settings, workspace!);
      },
      error => {
        this.logger.console.error(`Could not update '${document.uri}', ${error.message}`);
        this.logger.reportServerError();
      }
    );
  }

  /**
   * Retrieve the created from params and copy them to the appropriate
   * temporary directory.
   *
   * @param params parameters sent by the client.
   */
  public async copyNewlyCreatedFiles(params: DidChangeWatchedFilesParams) {
    for (const change of params.changes) {
      if (change.type === FileChangeType.Created) {
        if (this.canCompile) {
          const workspace = this.getInkWorkspaceOfFilePath(change.uri);
          if (workspace) {
            await this.compilationDirectoryManager.copyNewlyCreatedFile(
              change.uri,
              workspace,
            );
          } else {
            this.logger.console.error(
              `The temporary workspace is undefined, cannot copy newly created files.`
            );
            this.logger.reportServerError();
          }
        } else {
          this.logger.console.warn("The workspace is not ready yet, ignoring newly created files");
        }
      }
    }
  }

  /**
   * Fetch the configuration settings of the given document, from the client.
   *
   * @param document the document of which fetch the configuration settings,
   *                 can either be a TextDocument or a string-based uri.
   */
  public fetchDocumentConfigurationSettings(
    documentOrUri: TextDocument | string
  ): Thenable<PartialInkConfigurationSettings> {
    let documentUri: string;
    if (typeof documentOrUri === "string") {
      documentUri = documentOrUri;
    } else {
      documentUri = documentOrUri.uri;
    }

    if (!this.capabilities.configuration) {
      return Promise.resolve({});
    }

    let result = this.documentManager.documentSettings.get(documentUri);
    if (!result) {
      result = this.connection.workspace.getConfiguration({
        scopeUri: documentUri,
        section: "ink"
      });

      this.documentManager.documentSettings.set(documentUri, result);
    }

    return result;
  }

  public async getDocumentPathFromParams(
    params: ExecuteCommandParams
  ): Promise<DocumentPathAndWorkspace> {
    let fileURI: string;
    if (!params.arguments || params.arguments.length < 1) {
      fileURI = mergeSettings(this.initializationOptions, getDefaultSettings()).mainStoryPath;
    } else {
      if (typeof params.arguments[0] !== "string") {
        this.logger.console.warn(
          "The file URI provided is not a string, the behavior might be undefined. " +
            `The argument contained: ${JSON.stringify(params.arguments[0])}`
        );
      }

      fileURI = params.arguments[0] as string;
    }

    const documentPath = URI.parse(fileURI).fsPath;
    const basename = Path.basename(documentPath);
    let workspace = this.getInkWorkspaceOfFilePath(documentPath);

    if (!workspace) {
      this.logger.console.warn("The temporary workspace does not exist, attempting to restore…");
      await this.initializeInkWorkspaces();

      workspace = this.getInkWorkspaceOfFilePath(documentPath);

      if (!workspace) {
        this.logger.console.error("The temporary workspace is still missing, aborting command.");
        const message = `The temporary workspace is missing or ${basename} is not in the workspace.`;

        return Promise.reject(message);
      }
    }

    return Promise.resolve({ documentPath, workspace });
  }
}
