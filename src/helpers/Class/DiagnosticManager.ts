// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import { Diagnostic, IConnection } from "vscode-languageserver";
import URI from "vscode-uri";

import {
  DidCompileStoryParams,
  IConnectionLogger,
  InkError,
  InkErrorType,
  InkWorkspace
} from "../../types/types";

import { getDiagnosticSeverityFromInkErrorType } from "../utils";

import { CompilationNotification } from "../../types/identifiers";
import DocumentManager from "./DocumentManager";

/**
 * Manages the diagnostic reported by Inklecate.
 */
export default class DiagnosticManager {
  constructor(private connection: IConnection, private documentManager: DocumentManager, private logger: IConnectionLogger) { }

  /**
   * Send the given errors to the client.
   *
   * @param errors the errors to push.
   */
  public notifyClientAndPushDiagnostics(
    workspace: InkWorkspace,
    outputStoryPath: string,
    errors: InkError[]
  ) {
    for (const textDocument of this.documentManager.documents.all()) {
      const diagnostics: Diagnostic[] = [];
      for (const error of errors) {
        if (URI.parse(textDocument.uri).fsPath === error.filePath) {
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

        this.connection.sendNotification(CompilationNotification.didCompileStory, params);
      }

      this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    }
  }
}
