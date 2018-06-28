// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import {
  createConnection,
  Diagnostic,
  DidChangeConfigurationNotification,
  InitializeParams,
  ProposedFeatures,
  TextDocument,
  TextDocuments
} from "vscode-languageserver";

import {
  compileProject,
  DEFAULT_SETTINGS,
  prepareTempDirectoryForCompilation,
  updateFile
} from "./compile";

import {
  Capabilities,
  InkConfigurationSettings,
  InkError,
  InkWorkspace,
  PartialInkConfigurationSettings
} from "./types";

import {
  getDiagnosticSeverityFromInkErrorType,
  getPathFromUri,
  isFilePathChildOfDirPath
} from "./utils";

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
  const documentPath = getPathFromUri(document.uri);

  for (const workspaceKey of workspaceDirectories.keys()) {
    const workspace = workspaceDirectories.get(workspaceKey);
    if (!workspace) {
      continue;
    }

    const workspacePath = getPathFromUri(workspace.folder.uri);
    if (isFilePathChildOfDirPath(documentPath, workspacePath)) {
      return workspace;
    }
  }

  return undefined;
}

/**
 * Fetch the configuration settings of the given document, from the client.
 *
 * @param document the document of which fetch the configuration settings.
 */
function fetchDocumentConfigurationSettings(
  document: TextDocument
): Thenable<PartialInkConfigurationSettings> {
  if (!capabilities.configuration) {
    return Promise.resolve(Object.assign({}, DEFAULT_SETTINGS));
  }

  let result = documentSettings.get(document.uri);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: document.uri,
      section: "ink"
    });

    documentSettings.set(document.uri, result);
  }

  return result;
}

/**
 * Send the given errors to the client.
 *
 * @param errors the errors to push.
 */
function pushDiagnostics(errors: InkError[]) {
  for (const textDocument of documents.all()) {
    const diagnostics: Diagnostic[] = [];
    for (const error of errors) {
      if (textDocument.uri === error.filePath) {
        const diagnostic: Diagnostic = {
          severity: getDiagnosticSeverityFromInkErrorType(error.type),
          range: {
            start: { line: error.lineNumber - 1, character: 0 },
            end: { line: error.lineNumber, character: 0 }
          },
          message: error.message,
          source: "inklecate"
        };

        diagnostics.push(diagnostic);
      }
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

      prepareTempDirectoryForCompilation(workspaceFolder, connection, tempDir => {
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
  const workspace = getInkWorkspaceOfDocument(document);
  if (!workspace) {
    return;
  }

  const settings = await fetchDocumentConfigurationSettings(document);

  updateFile(document, workspace, error => {
    if (error) {
      connection.console.log(error.message);
      reportServerError();
    } else {
      compileProject(settings, workspace, connection, pushDiagnostics);
    }
  });
}

function reportServerError() {
  connection.window.showErrorMessage(
    "An unrecoverable error occured with Ink Language Server." +
      "Please see the logs for more information"
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
      textDocumentSync: documents.syncKind
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
});

connection.onDidChangeConfiguration(change => {
  documentSettings.clear();
});

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