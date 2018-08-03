// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import { ExecuteCommandParams, IConnection } from "vscode-languageserver/lib/main";

import { IInkCompiler, IInkRunner } from "../../types/backend";
import { Commands } from "../../types/identifiers";
import { IConnectionLogger, InkWorkspace } from "../../types/types";

import StoryRenderer from "./StoryRenderer";
import WorkspaceManager from "./WorkspaceManager";

/**
 * Runs command sent by the client.
 */
export default class CommandRunner {
  constructor(
    private connection: IConnection,
    private workspaceManager: WorkspaceManager,
    private compiler: IInkCompiler,
    private runner: IInkRunner,
    private logger: IConnectionLogger
  ) {}

  /**
   * Compile the story to which the given URI belong.
   *
   * @param params compile parameters, containing a file URI.
   */
  public compileStory(params: ExecuteCommandParams) {
    this.logger.console.info("Received compilation command.");

    this.workspaceManager.getDocumentPathFromParams(params).then(
      pathAndWorkspace => {
        this.executeCompileCommand(pathAndWorkspace.documentPath, pathAndWorkspace.workspace);
      },
      errorMessage => {
        const message = `The project could not be compiled: ${errorMessage}`;
        this.logger.showErrorMessage(message, true);
      }
    );

    return true;
  }

  /**
   * Run the story to which the given URI belong.
   *
   * @param params compile parameters, containing a file URI.
   */
  public playStory(params: ExecuteCommandParams) {
    this.logger.console.info("Received play story command.");

    this.workspaceManager.getDocumentPathFromParams(params).then(
      pathAndWorkspace => {
        this.executeCompileCommand(pathAndWorkspace.documentPath, pathAndWorkspace.workspace, true);
      },
      errorMessage => {
        const message = `The project could not be compiled: ${errorMessage}`;
        this.logger.showErrorMessage(message, true);
      }
    );

    return true;
  }

  /**
   * If a story is currently playing and prompting for a choice selection,
   * select the choice at the given index.
   *
   * @param params parameters, containing the index of the chocie to select.
   */
  public selectOption(params: ExecuteCommandParams) {
    this.logger.console.info("Received select option command.");

    if (!params.arguments || !params.arguments[0]) {
      this.logger.showErrorMessage(
        `${Commands.selectOption} error: the command was called with no arguments.`,
        true
      );
      return;
    }

    const index = parseInt(params.arguments[0]);

    this.runner.chooseOption(index);
  }

  /**
   * Kill the current Inklecate process, if applicable.
   */
  public stopCurrentStory() {
    this.logger.console.info("Received stop story command.");

    this.runner.stopCurrentStory();
  }

  /**
   * Compile the story contained in `workspace`.
   * `documentPath` is required to retrieve the proper settings, which
   * are scoped to the resource.
   *
   * @param documentUri the document URI used to retrieved the settings.
   * @param workspace the ink workspace to compile.
   */
  private async executeCompileCommand(
    documentUri: string,
    workspace: InkWorkspace,
    play: boolean = false
  ) {
    if (!this.workspaceManager.canCompile) {
      this.logger.console.info(
        "The workspace is not ready yet, try compiling again in a few seconds…"
      );
      this.logger.showInformationMessage(
        "Ink support is still initializing, please try again in a few seconds.",
        false
      );
      return;
    }

    const settings = await this.workspaceManager.fetchDocumentConfigurationSettings(documentUri);
    const storyRenderer = play ? new StoryRenderer(this.connection) : undefined;

    this.compiler.compileStory(settings, workspace);
  }
}
