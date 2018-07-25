// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import {
  createConnection,
  Diagnostic,
  DidChangeConfigurationNotification,
  ExecuteCommandParams,
  InitializeParams,
  ProposedFeatures,
  TextDocument,
  TextDocuments
} from "vscode-languageserver";

import Uri from "vscode-uri";

import {
  chooseOption,
  compileProject,
  killInklecate,
  prepareTempDirectoryForCompilation,
  updateFile
} from "./inklecate";

import {
  Capabilities,
  DidCompileStoryParams,
  InkConnectionLogger,
  InkError,
  InkErrorType,
  InkWorkspace,
  PartialInkConfigurationSettings,
} from "./types";

import {
  flagDefaultSettingsAsDirty,
  getDefaultSettings,
} from "./configuration";

import {
  Commands,
  CompilationNotification,
  RuntimeNotification
} from "./identifiers";

import { getDiagnosticSeverityFromInkErrorType, isFilePathChildOfDirPath } from "./utils";

import { checkPlatformAndDownloadBinaryDependency } from "./install";
import { StoryRenderer } from "./story-renderer";

/* Properties */
/******************************************************************************/
/** Capabilities defined by the client. Defaults to none. */
const capabilities: Capabilities = {
  configuration: false,
  workspaceFolder: false,
  diagnostic: false
};

/** Connection with the client. */
const connection = createConnection(ProposedFeatures.all);
const logger = new InkConnectionLogger(connection);

/** Documents managed by the clients. */
const documents: TextDocuments = new TextDocuments();

/**
 * Workspace directories managed by the server,
 * mapped from the workspace managed by the client.
 *
 * URIs of the client's `WorkspaceFolder` will be used as keys.
 */
const workspaceDirectories: Map<string, InkWorkspace> = new Map();

/**
 * Document settings, scoped per document, returned by the client.
 *
 * URIs of the client's `TextDocument` will be used as keys.
 */
const documentSettings: Map<string, Thenable<PartialInkConfigurationSettings>> = new Map();

let canCompile = false;

/* Helpers */
/******************************************************************************/
/**
 * Returns the InkWorkspace of the given document. If no workspace could be found,
 * returns `undefined`.
 *
 * Since Inklecate requires as a full compilation of the entire related project
 * to push diagnostics, the workspace of each document must be known.
 *
 * @param document a text document, belonging to the returned workspace.
 */
function getInkWorkspaceOfDocument(document: TextDocument): InkWorkspace | undefined {
  const documentPath = Uri.parse(document.uri).fsPath;
  return getInkWorkspaceOfFilePath(documentPath);
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
function getInkWorkspaceOfFilePath(documentUri: string): InkWorkspace | undefined {
  for (const workspaceKey of workspaceDirectories.keys()) {
    const workspace = workspaceDirectories.get(workspaceKey);
    if (!workspace) {
      continue;
    }

    const workspacePath = Uri.parse(workspace.folder.uri).fsPath;
    if (isFilePathChildOfDirPath(documentUri, workspacePath)) {
      return workspace;
    }
  }

  return undefined;
}

/**
 * Fetch the configuration settings of the given document, from the client.
 *
 * @param document the document of which fetch the configuration settings,
 *                 can either be a TextDocument or a string-based uri.
 */
function fetchDocumentConfigurationSettings(
  documentOrUri: TextDocument | string
): Thenable<PartialInkConfigurationSettings> {
  let documentUri: string;
  if (typeof documentOrUri === "string") {
    documentUri = documentOrUri;
  } else {
    documentUri = documentOrUri.uri;
  }

  if (!capabilities.configuration) {
    return Promise.resolve(Object.assign({}, getDefaultSettings()));
  }

  let result = documentSettings.get(documentUri);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: documentUri,
      section: "ink"
    });

    documentSettings.set(documentUri, result);
  }

  return result;
}

/**
 * Send the given errors to the client.
 *
 * @param errors the errors to push.
 */
function notifyClientAndPushDiagnostics(
  workspace: InkWorkspace,
  outputStoryPath: string,
  errors: InkError[]
) {
  for (const textDocument of documents.all()) {
    const diagnostics: Diagnostic[] = [];
    for (const error of errors) {
      if (Uri.parse(textDocument.uri).fsPath === error.filePath) {
        let message = error.message;
        if (error.type === InkErrorType.Todo) {
          message = `Todo: ${message}`;
        }
        const diagnostic: Diagnostic = {
          severity: getDiagnosticSeverityFromInkErrorType(error.type),
          range: {
            start: { line: error.lineNumber - 1, character: 0 },
            end: { line: error.lineNumber, character: 0 }
          },
          message,
          source: "inklecate"
        };

        diagnostics.push(diagnostic);
      }
    }

    // If there a no errors to report, we'll send a custom notification to
    // the client, asking it to remember the path to the compiled story.
    if (diagnostics.length === 0) {
      const params: DidCompileStoryParams = {
        workspaceUri: workspace.folder.uri,
        storyUri: `file://${outputStoryPath}`
      };

      connection.sendNotification(CompilationNotification.didCompileStory, params);
    }

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  }
}

/**
 * Initialize workspaces by fetching opened `WorkspaceFolder` from the client and
 * creating the temporary directories which will hold copies of the Ink Project.
 */
async function initializeInkWorkspaces() {
  const workspaceFolders = await connection.workspace.getWorkspaceFolders();

  if (workspaceFolders) {
    for (const workspaceFolder of workspaceFolders) {
      let workspace = workspaceDirectories.get(workspaceFolder.uri);

      if (!workspace) {
        workspace = {
          folder: workspaceFolder
        };

        workspaceDirectories.set(workspaceFolder.uri, workspace);
      }

      prepareTempDirectoryForCompilation(workspaceFolder, logger, tempDir => {
        if (tempDir) {
          (workspace as InkWorkspace).temporaryCompilationDirectory = tempDir;
        } else {
          reportServerError();
        }
      });
    }
  }
}

/**
 * Update the content of the given document, in the temporary copy of the workspace,
 * and compile the project.
 *
 * @param document the document to update.
 */
async function updateDocumentAndCompileWorkspace(document: TextDocument) {
  if (!canCompile) { return; }

  const workspace = getInkWorkspaceOfDocument(document);
  if (!workspace) {
    return;
  }

  const settings = await fetchDocumentConfigurationSettings(document);

  updateFile(document, workspace, logger, error => {
    if (error) {
      connection.console.log(`Could not update '${document.uri}', ${error.message}`);
      reportServerError();
    } else {
      compileProject(settings, workspace, logger, undefined, notifyClientAndPushDiagnostics);
    }
  });
}

/**
 * Compile the story contained in `workspace`.
 * `documentPath` is required to retrieve the proper settings, which
 * are scoped to the resource.
 *
 * @param documentUri the document URI used to retrieved the settings.
 * @param workspace the ink workspace to compile.
 */
async function executeCompileCommand(documentUri: string, workspace: InkWorkspace, play: boolean = false) {
  if (!canCompile) { return; }

  const settings = await fetchDocumentConfigurationSettings(documentUri);
  const storyRenderer = play ? new StoryRenderer(connection) : undefined;

  compileProject(settings, workspace, logger, storyRenderer, notifyClientAndPushDiagnostics);
}

function reportServerError() {
  connection.window.showErrorMessage(
    "An unrecoverable error occured with Ink Language Server. " +
      "Please see the logs for more information."
  );
}

/* Connection callbacks */
/******************************************************************************/
connection.onInitialize((params: InitializeParams) => {
  connection.console.log("Server Initialized");

  const clientCapabilities = params.capabilities;

  if (clientCapabilities.workspace) {
    capabilities.configuration = !!clientCapabilities.workspace.configuration;
    capabilities.workspaceFolder = !!clientCapabilities.workspace.workspaceFolders;

    if (clientCapabilities.textDocument) {
      capabilities.diagnostic = !!clientCapabilities.textDocument.publishDiagnostics;
    }
  }

  return {
    capabilities: {
      textDocumentSync: documents.syncKind,
      executeCommandProvider: {
        commands: [
          Commands.compileStory,
          Commands.playStory,
          Commands.selectOption
        ]
      }
    }
  };
});

connection.onInitialized(() => {
  if (capabilities.configuration) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }

  if (capabilities.workspaceFolder) {
    connection.workspace.onDidChangeWorkspaceFolders(event => {
      initializeInkWorkspaces();
    });
  }

  initializeInkWorkspaces();

  checkPlatformAndDownloadBinaryDependency(logger, (success) => {
    flagDefaultSettingsAsDirty();
    canCompile = success;
  });
});

connection.onDidChangeConfiguration(change => {
  documentSettings.clear();
});

connection.onExecuteCommand(
  (params): void => {
    switch (params.command) {
      case Commands.compileStory:
        runCompileStoryCommand(params);
        break;
      case Commands.playStory:
        runPlayStoryCommand(params);
        break;
      case Commands.selectOption:
        runSelectOptionCommand(params);
        break;
      default: break;
    }
  }
);

/* Document callbacks */
/******************************************************************************/
documents.onDidChangeContent(change => {
  updateDocumentAndCompileWorkspace(change.document);
});

documents.onDidClose(event => {
  documentSettings.delete(event.document.uri);
});

/* Final setup */
/******************************************************************************/
documents.listen(connection);
connection.listen();


function runCompileStoryCommand(params: ExecuteCommandParams) {
  connection.console.log('Received compilation command.');

  const pathAndWorkspace = getDocumentPathFromParams(params);

  if (!pathAndWorkspace) {
    return undefined;
  }

  executeCompileCommand(pathAndWorkspace.documentPath, pathAndWorkspace.workspace);
}

function runPlayStoryCommand(params: ExecuteCommandParams) {
  connection.console.log('Received play story command.');

  const pathAndWorkspace = getDocumentPathFromParams(params);

  if (!pathAndWorkspace) {
    return undefined;
  }

  executeCompileCommand(pathAndWorkspace.documentPath, pathAndWorkspace.workspace, true);
}

function runSelectOptionCommand(params: ExecuteCommandParams) {
  connection.console.log('Received select option command.');

  if (!params.arguments || !params.arguments[0]) {
    connection.window.showErrorMessage(`${Commands.selectOption} error: the command was called with no arguments.`);
    return;
  }

  const index = parseInt(params.arguments[0]);

  chooseOption(index);
}

function runKillInklecateCommand() {
  connection.console.log('Received kill inklecate command.');

  killInklecate();
}

function getDocumentPathFromParams(params: ExecuteCommandParams): DocumentPathAndWorkspace | undefined {
  let fileURI: string;
  if (!params.arguments || params.arguments.length < 1) {
    fileURI = getDefaultSettings().mainStoryPath;
  } else {
    fileURI = params.arguments[0] as string;
  }

  const documentPath = Uri.parse(fileURI).fsPath;
  const workspace = getInkWorkspaceOfFilePath(documentPath);

  if (!workspace) {
    connection.console.log("Could not retrieve the workspace of the given file.");
    return undefined;
  }

  return { documentPath, workspace };
}

interface DocumentPathAndWorkspace {
  documentPath: string;
  workspace: InkWorkspace;
}