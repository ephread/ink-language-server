// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as ChildProcess from "child_process";
import * as Fs from "fs-extra";
import * as Path from "path";

import Uri from "vscode-uri";

import {
  IConnectionLogger,
  InkConfigurationSettings,
  InkError,
  InkErrorType,
  InkWorkspace,
  PartialInkConfigurationSettings,
  Platform,
  RuntimeChoice
} from "../types/types";

import { IInkCompiler, IInkRunner } from "../types/backend";

import {
  determinePlatform,
  getDefaultSettings,
  getMonoPath,
  mergeSettings
} from "../helpers/configuration";

import StoryRenderer from "../helpers/Class/StoryRenderer";

import DiagnosticManager from "../helpers/Class/DiagnosticManager";

export default class InklecateBackend implements IInkCompiler, IInkRunner {
  private inklecateProcess: ChildProcess.ChildProcess | undefined;

  constructor(
    private storyRenderer: StoryRenderer,
    private diagnosticManager: DiagnosticManager,
    private logger: IConnectionLogger
  ) {}

  public compileStory(settings: PartialInkConfigurationSettings, inkWorkspace: InkWorkspace) {
    this.runInklecate(settings, inkWorkspace, false);
  }

  public runStory(settings: PartialInkConfigurationSettings, inkWorkspace: InkWorkspace) {
    this.runInklecate(settings, inkWorkspace, true);
  }

  /**
   * Compile the project and report any errors through `completion`.
   *
   * @param settings the configuration settings to use.
   * @param inkWorkspace the workspace to compile.
   * @param connection the client connection.
   * @param completion the callback to call upon completion.
   */
  public runInklecate(
    settings: PartialInkConfigurationSettings,
    inkWorkspace: InkWorkspace,
    isPlaying: boolean = false
  ) {
    const tempDir = inkWorkspace.temporaryCompilationDirectory;
    if (!tempDir) {
      this.logger.console.warn(
        `Temporary directory for ${inkWorkspace.folder.name} is \`undefined\`, ignoring…`
      );
      return;
    }

    const mergedSettings = mergeSettings(settings, getDefaultSettings());

    const mainStoryTempPath = Path.join(tempDir, mergedSettings.mainStoryPath);

    this.testThatInklecateIsExecutable(mergedSettings, mainStoryTempPath).then(() => {
      this.spawnInklecate(mergedSettings, mainStoryTempPath, inkWorkspace, isPlaying);
    });
  }

  public chooseOption(index: number) {
    if (this.inklecateProcess) {
      this.inklecateProcess.stdin.write(`${index}\n`);
    }
  }

  public stopCurrentStory() {
    if (this.inklecateProcess) {
      this.inklecateProcess.kill();
    }
  }

  /**
   * Spawn a child process of `inklecatePath` to cimpile the project.
   *
   * @param inklecatePath the path to the inklecate executable.
   * @param mainStoryPath the path to the main ink file (in the client workspace).
   * @param mainStoryTempPath the path to the main ink file (in the temporary compilation directory).
   * @param inkWorkspace the workspace to compile.
   */
  private spawnInklecate(
    settings: InkConfigurationSettings,
    mainStoryTempPath: string,
    inkWorkspace: InkWorkspace,
    isPlaying: boolean = false
  ) {
    const monoPath = getMonoPath(settings.runThroughMono);
    const command = monoPath ? monoPath : settings.inklecateExecutablePath;
    const outputStoryPath = `${mainStoryTempPath}.json`;
    let args: string[];

    if (isPlaying) {
      args = settings.runThroughMono
        ? [settings.inklecateExecutablePath, "-p", mainStoryTempPath]
        : ["-p", mainStoryTempPath];
    } else {
      args = settings.runThroughMono
        ? [settings.inklecateExecutablePath, "-o", outputStoryPath, mainStoryTempPath]
        : ["-o", outputStoryPath, mainStoryTempPath];
    }

    this.inklecateProcess = ChildProcess.spawn(command, args, {
      cwd: Path.dirname(settings.inklecateExecutablePath),
      env: {
        MONO_BUNDLED_OPTIONS: "--debug"
      }
    });

    this.inklecateProcess.on("error", error => {
      const platform = determinePlatform();
      const inklecateMessage = "The inklecate process could not be created or crashed: ";
      const possibleReasons: string[] = [];

      if (settings.runThroughMono && platform !== Platform.Windows) {
        possibleReasons.push("mono is not installed in the $PATH");
      }

      switch (platform) {
        case Platform.MacOs:
          possibleReasons.push("the prebuilt binary was not installed");
        case Platform.Other:
          possibleReasons.push("the value of `ink.inklecateExecutablePath` is incorrect");
          break;
        case Platform.Windows:
          possibleReasons.push(".NET is likely missing");
      }

      const plateformName = Platform.name(platform);

      this.logger.console.error(
        `Inklecate spawn error (platform: ${plateformName}) - ${error.message}`
      );
      this.logger.showErrorMessage(
        `${inklecateMessage} ${possibleReasons.join(" or ")}. Please see the log for more details.`,
        false
      );
    });

    let errors: InkError[] = [];

    this.inklecateProcess.stdin.setDefaultEncoding("utf8");
    this.inklecateProcess.stderr.setEncoding("utf8");
    this.inklecateProcess.stderr.on("data", text => {
      if (typeof text === "string") {
        // Strip Byte order mark
        text = text.replace(/^\uFEFF/, "");

        if (text.length > 0) {
          const inklecateMessage = "Inklecate returned an error, see the log for more details.";
          this.logger.console.error(`${inklecateMessage}: ${text}`);
          this.logger.showErrorMessage(inklecateMessage, false);
        }
      }
    });

    this.inklecateProcess.stdout.setEncoding("utf8");
    this.inklecateProcess.stdout.on("data", text => {
      if (typeof text === "string") {
        const newErrors = this.parseErrorsOrRenderStory(
          text,
          Path.dirname(settings.mainStoryPath),
          inkWorkspace,
          isPlaying
        );
        errors = errors.concat(newErrors);
      }
    });

    this.inklecateProcess.stdout.on("close", () => {
      if (isPlaying) {
        this.storyRenderer.showEndOfStory();
      }
      this.diagnosticManager.notifyClientAndPushDiagnostics(inkWorkspace, outputStoryPath, errors);
    });

    this.inklecateProcess.on("exit", () => {
      this.inklecateProcess = undefined;
    });
  }

  /**
   * Parse the output of Inklecate and returns any errors or warnings found.
   *
   * @param text inklecate's output
   * @param mainStoryPathPrefix the prefix path for the real files locations (i. e. not the
   *                            temporary directory).
   * @param workspace the workspace for which the compilation took place.
   */
  private parseErrorsOrRenderStory(
    text: string,
    mainStoryPathPrefix: string,
    workspace: InkWorkspace,
    isPlaying: boolean
  ): InkError[] {
    // Strip Byte order mark
    text = text.replace(/^\uFEFF/, "");
    if (text.length === 0) {
      return [];
    }

    const lines = text.split("\n");
    const inkErrors: InkError[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      const choiceMatches = trimmedLine.match(/^(\d+):\s*(.*)/);
      const errorMatches = trimmedLine.match(
        /^(ERROR|WARNING|RUNTIME ERROR|RUNTIME WARNING|TODO): ('([^']+)' )?line (\d+): (.+)/
      );
      const tagMatches = trimmedLine.match(/^(# tags:) (.+)/);
      const promptMatches = trimmedLine.match(/^\?>/);
      const endOfStoryMatches = trimmedLine.match(/^--- End of story ---/);

      if (errorMatches) {
        const errorType = InkErrorType.parse(errorMatches[1]);
        const path = Path.join(
          Uri.parse(workspace.folder.uri).fsPath,
          mainStoryPathPrefix,
          errorMatches[3]
        );

        if (errorType) {
          if (
            errorType === InkErrorType.RuntimeError ||
            errorType === InkErrorType.RuntimeWarning
          ) {
            if (isPlaying) {
              this.storyRenderer.reportError(
                `${errorType} while playing the story: ${
                  errorMatches[5]
                } (in '${path}' at line ${parseInt(errorMatches[4])})`
              );
            }
          } else {
            inkErrors.push({
              filePath: path,
              lineNumber: parseInt(errorMatches[4]),
              message: errorMatches[5],
              type: errorType
            });
          }
        }
      } else if (tagMatches) {
        if (isPlaying) {
          const tags = tagMatches[2].split(", ");
          this.storyRenderer.showTag(tags);
        }
      } else if (choiceMatches) {
        if (isPlaying) {
          const choice: RuntimeChoice = {
            index: parseInt(choiceMatches[1]),
            text: choiceMatches[2]
          };

          this.storyRenderer.showChoice(choice);
        }
      } else if (promptMatches) {
        if (isPlaying) {
          this.storyRenderer.showPrompt();
        }
      } else if (endOfStoryMatches) {
        if (isPlaying) {
          this.storyRenderer.showEndOfStory();
        }
      } else if (line.length > 0) {
        if (isPlaying) {
          this.storyRenderer.showText(line);
        }
      }
    }

    return inkErrors;
  }

  private testThatInklecateIsExecutable(
    mergedSettings: InkConfigurationSettings,
    storyPath: string
  ): Thenable<void> {
    const handleStoryAccessError = (error: any) => {
      const storyErrorMessage = `'mainStoryPath' (${
        mergedSettings.mainStoryPath
      }) is not readable.`;
      this.logger.console.error(`${storyErrorMessage} - ${error.message}`);
      this.logger.showErrorMessage(storyErrorMessage, false);
    };

    // Though checking these beforehand is subjected to race conditions, it's useful as it'll
    // give the user a hint about what may be going wrong.
    if (mergedSettings.runThroughMono) {
      return Fs.access(storyPath, Fs.constants.R_OK).catch(handleStoryAccessError);
    } else {
      return Fs.access(mergedSettings.inklecateExecutablePath, Fs.constants.X_OK)
        .catch(error => {
          const inklecateErrorMessage = `'inklecatePath' (${
            mergedSettings.inklecateExecutablePath
          }) is not executable.`;
          this.logger.console.error(`${inklecateErrorMessage} - ${error.message}`);
          this.logger.showErrorMessage(inklecateErrorMessage, false);
        })
        .then(() => {
          return Fs.access(storyPath, Fs.constants.R_OK);
        })
        .catch(handleStoryAccessError);
    }
  }
}
