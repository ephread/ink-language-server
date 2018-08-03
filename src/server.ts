// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import {
  createConnection,
  DidChangeConfigurationNotification,
  IConnection,
  InitializeParams,
  ProposedFeatures
} from "vscode-languageserver/lib/main";

import { InkConnectionLogger } from "./types/types";

import { flagDefaultSettingsAsDirty } from "./helpers/configuration";

import { Commands } from "./types/identifiers";

import { checkPlatformAndDownloadBinaryDependency } from "./helpers/install";

import InklecateBackend from "./backends/InklecateBackend";
import CommandRunner from "./helpers/Class/CommandRunner";
import CompilationDirectoryManager from "./helpers/Class/CompilationDirectoryManager";
import DiagnosticManager from "./helpers/Class/DiagnosticManager";
import DocumentManager from "./helpers/Class/DocumentManager";
import StoryRenderer from "./helpers/Class/StoryRenderer";
import WorkspaceManager from "./helpers/Class/WorkspaceManager";

/* Properties */
/******************************************************************************/
const connection = createConnection(ProposedFeatures.all);
const logger = createConnectionLogger(connection);

const documentManager = new DocumentManager();
const diagnosticManager = new DiagnosticManager(connection, documentManager, logger);
const compilationDirectoryManager = new CompilationDirectoryManager(logger);
const storyRenderer = new StoryRenderer(connection);

const inklecateBackend = new InklecateBackend(storyRenderer, diagnosticManager, logger);

const workspaceManager = new WorkspaceManager(
  connection,
  documentManager,
  compilationDirectoryManager,
  inklecateBackend,
  logger
);

const commandRunner = new CommandRunner(
  connection,
  workspaceManager,
  inklecateBackend,
  inklecateBackend,
  logger
);

/* Helpers */
/******************************************************************************/
/**
 * Create the logging wrapper.
 *
 * @param clientConnection the connection to which log.
 */
function createConnectionLogger(clientConnection: IConnection) {
  const argv = process.argv.slice(2);
  const verbose = argv.indexOf("--verbose") > -1;

  return new InkConnectionLogger(clientConnection, verbose);
}

/* Connection callbacks */
/******************************************************************************/
connection.onInitialize((params: InitializeParams) => {
  logger.console.info("Language Server connected.");

  workspaceManager.initializeCapabilities(params.capabilities);

  return {
    capabilities: {
      textDocumentSync: documentManager.documents.syncKind,
      executeCommandProvider: {
        commands: [Commands.compileStory, Commands.playStory, Commands.selectOption]
      }
    }
  };
});

connection.onInitialized(() => {
  if (workspaceManager.capabilities.configuration) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }

  if (workspaceManager.capabilities.workspaceFolder) {
    connection.workspace.onDidChangeWorkspaceFolders(event => {
      workspaceManager.initializeInkWorkspaces();
    });
  }

  checkPlatformAndDownloadBinaryDependency(logger, success => {
    flagDefaultSettingsAsDirty();
    workspaceManager.initializeInkWorkspaces();
  });
});

connection.onDidChangeConfiguration(() => {
  documentManager.documentSettings.clear();
});

connection.onDidChangeWatchedFiles(workspaceManager.copyNewlyCreatedFiles);

connection.onExecuteCommand(
  (params): void => {
    switch (params.command) {
      case Commands.compileStory:
        commandRunner.compileStory(params);
        break;
      case Commands.playStory:
        commandRunner.playStory(params);
        break;
      case Commands.selectOption:
        commandRunner.selectOption(params);
        break;
      default:
        break;
    }
  }
);

/* Document callbacks */
/******************************************************************************/
documentManager.documents.onDidChangeContent(change => {
  workspaceManager.updateDocumentAndCompileWorkspace(change.document);
});

documentManager.documents.onDidClose(event => {
  documentManager.documentSettings.delete(event.document.uri);
});

/* Final setup */
/******************************************************************************/
documentManager.documents.listen(connection);
connection.listen();
