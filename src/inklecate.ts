// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as ChildProcess from "child_process";
import * as Fs from "fs-extra";
import * as Os from "os";
import * as Path from "path";
import * as Uuid from "uuid/v4";

import Uri from "vscode-uri";

import { TextDocument, WorkspaceFolder } from "vscode-languageserver";
import {
  IConnectionLogger,
  InkConfigurationSettings,
  InkError,
  InkErrorType,
  InkWorkspace,
  PartialInkConfigurationSettings,
  Platform,
  RuntimeChoice
} from "./types/types";

import { determinePlatform, getDefaultSettings, getMonoPath, mergeSettings } from "./helpers/configuration";

import StoryRenderer from "./helpers/Class/StoryRenderer";

import DiagnosticManager from "./helpers/Class/DiagnosticManager";
import { isInkFile } from './helpers/utils';

/* Constants */
/******************************************************************************/

let inklecateProcess: ChildProcess.ChildProcess | undefined;

/* Helpers */
/******************************************************************************/
/**
 * Prepare the workspace for compilation. Create a temporary directory and
 * copies all of the project ink files into it, while preserving the subdirectory
 * hierarchy. The resulting directory should be kept safely for the remaining
 * of the session.
 *
 * @param workspace the workspace containing all the ink files.
 * @param connection the client connection.
 * @returns the temporary directory containing copies of the workspace's ink files.
 */
export function prepareTempDirectoryForCompilation(
  workspaceFolder: WorkspaceFolder,
  logger: IConnectionLogger
): Promise<string | void> {
  logger.console.info(`Creating temporary compilation directory for: '${workspaceFolder.name}'.`);

  const tempDirectory = Path.join(Os.tmpdir(), Uuid());
  const workspacePath = Uri.parse(workspaceFolder.uri).fsPath;

  return Fs.mkdir(tempDirectory).then(() => {
    logger.console.info(`'${workspaceFolder.name}': Mirror directory created.`);

    return Fs.copy(workspacePath, tempDirectory, {
      filter: (src: string, dest: string) => {
        try {
          const isDir = Fs.lstatSync(src).isDirectory();
          if (isDir) { return true; }

          return isInkFile(src, false, logger);
        } catch (error) {
          logger.console.warn(
            `File '${src}' doesn't exist and will be ignored. - ${error.message}`
          );
          return false;
        }
      }
    }).catch((error) => {
      logger.console.error(`Could not copy files: ${error.message}`);
      return Promise.reject(error);
    });
  }, (error) => {
    logger.console.error(`Could not create temporary compilation directory: ${error.message}`);
    return Promise.reject(error);
  }).then(() => {
    logger.console.info(`'${workspaceFolder.name}': File hierarchy copied.`);
    return Promise.resolve(tempDirectory);
  });
}

export async function copyNewlyCreatedFile(
  fileUri: string,
  workspace: InkWorkspace,
  logger: IConnectionLogger,
) {
  const filePath = Uri.parse(fileUri).fsPath;
  const basename = Path.basename(filePath);

  if (!isInkFile(filePath, true, logger)) { return; }

  if (!workspace.temporaryCompilationDirectory) {
    logger.console.warn(`The temporary compilation directory is undefined, cannot copy ${fileUri}.`);
    const message = `The server could not process '${filePath}'. ` +
                    'As subsequent compilations may fail, you should reload your project.';
    logger.showWarningMessage(message, true);
    return;
  }

  const workspaceFolderPath = Uri.parse(workspace.folder.uri).fsPath;

  const relativeFilePath = Path.relative(workspaceFolderPath, filePath);
  const relativeParentDirectoryPath = Path.dirname(relativeFilePath);

  const temporaryDirectoryPath = Path.join(
    workspace.temporaryCompilationDirectory,
    relativeParentDirectoryPath
  );
  const temporaryFilePath = Path.join(workspace.temporaryCompilationDirectory, relativeFilePath);

  const erroMessage = `Could not compile the new file (${basename}) – please see the log for more details`;
  Fs.mkdirp(temporaryDirectoryPath)
    .catch(error => {
      logger.console.error(`Could not create new file in the compilation directory: ${error.message}`);
      logger.showErrorMessage(erroMessage, false);
    })
    .then(() => {
      return Fs.copy(filePath, temporaryFilePath);
    })
    .catch(error => {
      logger.console.error(`Could not create new file in the compilation directory: ${error.message}`);
      logger.showErrorMessage(erroMessage, false);
    });
}

/**
 * Replace the original ink file found in `workspace.temporaryCompilationDirectory`,
 * with the update content of `document`.
 *
 * @param document document holding the new content.
 * @param workspace the workspace to which the document belongs.
 * @param callback called once the file has been updated.
 */
export function updateFile(
  document: TextDocument,
  workspace: InkWorkspace,
  logger: IConnectionLogger,
  callback: (error: Error) => void
) {
  if (!workspace.folder || !workspace.temporaryCompilationDirectory) {
    callback(new Error(`Could not update file: ${document.uri}`));
    return;
  }

  const workspacePath = Uri.parse(workspace.folder.uri).fsPath;
  const documentContent = document.getText();
  const path = Uri.parse(document.uri).fsPath;

  const relativePath = Path.relative(workspacePath, path);
  const fullPath = Path.join(workspace.temporaryCompilationDirectory, relativePath);

  Fs.mkdirp(Path.dirname(fullPath))
    .catch(error => {
      callback(error);
    })
    .then(() => {
      Fs.writeFile(fullPath, documentContent, callback);
    });
}

/**
 * Compile the project and report any errors through `completion`.
 *
 * @param settings the configuration settings to use.
 * @param inkWorkspace the workspace to compile.
 * @param connection the client connection.
 * @param completion the callback to call upon completion.
 */
export function compileProject(
  settings: PartialInkConfigurationSettings,
  inkWorkspace: InkWorkspace,
  logger: IConnectionLogger,
  storyRenderer: StoryRenderer | undefined,
  diagnosticManager: DiagnosticManager
) {
  const tempDir = inkWorkspace.temporaryCompilationDirectory;
  if (!tempDir) {
    logger.console.warn(`Temporary directory for ${inkWorkspace.folder.name} is \`undefined\`, ignoring…`);
    return;
  }

  const mergedSettings = mergeSettings(settings, getDefaultSettings());

  const mainStoryTempPath = Path.join(tempDir, mergedSettings.mainStoryPath);

  testThatInklecateIsExecutable(mergedSettings, logger, mainStoryTempPath).then(() => {
    spawnInklecate(
      mergedSettings,
      mainStoryTempPath,
      inkWorkspace,
      logger,
      storyRenderer,
      diagnosticManager
    );
  });
}

export function chooseOption(index: number) {
  if (inklecateProcess) {
    inklecateProcess.stdin.write(`${index}\n`);
  }
}

export function killInklecate() {
  if (inklecateProcess) {
    inklecateProcess.kill();
  }
}

/**
 * Spawn a child process of `inklecatePath` to cimpile the project.
 *
 * @param inklecatePath the path to the inklecate executable.
 * @param mainStoryPath the path to the main ink file (in the client workspace).
 * @param mainStoryTempPath the path to the main ink file (in the temporary compilation directory).
 * @param inkWorkspace the workspace to compile.
 * @param connection the client connection.
 * @param completion the callback to call upon completion.
 */
function spawnInklecate(
  settings: InkConfigurationSettings,
  mainStoryTempPath: string,
  inkWorkspace: InkWorkspace,
  logger: IConnectionLogger,
  storyRenderer: StoryRenderer | undefined,
  diagnosticManager: DiagnosticManager
) {
  const monoPath = getMonoPath(settings.runThroughMono);
  const command = monoPath ? monoPath : settings.inklecateExecutablePath;
  const outputStoryPath = `${mainStoryTempPath}.json`;
  let args: string[];

  if (storyRenderer) {
    args = settings.runThroughMono
      ? [settings.inklecateExecutablePath, "-p", mainStoryTempPath]
      : ["-p", mainStoryTempPath];
  } else {
    args = settings.runThroughMono
      ? [settings.inklecateExecutablePath, "-o", outputStoryPath, mainStoryTempPath]
      : ["-o", outputStoryPath, mainStoryTempPath];
  }

  inklecateProcess = ChildProcess.spawn(command, args, {
    cwd: Path.dirname(settings.inklecateExecutablePath),
    env: {
      MONO_BUNDLED_OPTIONS: "--debug"
    }
  });

  inklecateProcess.on("error", error => {
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

    logger.console.error(`Inklecate spawn error (platform: ${plateformName}) - ${error.message}`);
    logger.showErrorMessage(
      `${inklecateMessage} ${possibleReasons.join(" or ")}. Please see the log for more details.`,
      false
    );
  });

  let errors: InkError[] = [];

  inklecateProcess.stdin.setDefaultEncoding("utf8");
  inklecateProcess.stderr.setEncoding("utf8");
  inklecateProcess.stderr.on("data", text => {
    if (typeof text === "string") {
      // Strip Byte order mark
      text = text.replace(/^\uFEFF/, "");

      if (text.length > 0) {
        const inklecateMessage = "Inklecate returned an error, see the log for more details.";
        logger.console.error(`${inklecateMessage}: ${text}`);
        logger.showErrorMessage(inklecateMessage, false);
      }
    }
  });

  inklecateProcess.stdout.setEncoding("utf8");
  inklecateProcess.stdout.on("data", text => {
    if (typeof text === "string") {
      const newErrors = parseErrorsOrRenderStory(
        text,
        Path.dirname(settings.mainStoryPath),
        inkWorkspace,
        storyRenderer
      );
      errors = errors.concat(newErrors);
    }
  });

  inklecateProcess.stdout.on("close", () => {
    if (storyRenderer) {
      storyRenderer.showEndOfStory();
    }
    diagnosticManager.notifyClientAndPushDiagnostics(inkWorkspace, outputStoryPath, errors);
  });

  inklecateProcess.on("exit", () => {
    inklecateProcess = undefined;
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
function parseErrorsOrRenderStory(
  text: string,
  mainStoryPathPrefix: string,
  workspace: InkWorkspace,
  storyRenderer: StoryRenderer | undefined
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
        if (errorType === InkErrorType.RuntimeError || errorType === InkErrorType.RuntimeWarning) {
          if (storyRenderer) {
            storyRenderer.reportError(
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
      if (storyRenderer) {
        const tags = tagMatches[2].split(", ");
        storyRenderer.showTag(tags);
      }
    } else if (choiceMatches) {
      if (storyRenderer) {
        const choice: RuntimeChoice = {
          index: parseInt(choiceMatches[1]),
          text: choiceMatches[2]
        };

        storyRenderer.showChoice(choice);
      }
    } else if (promptMatches) {
      if (storyRenderer) {
        storyRenderer.showPrompt();
      }
    } else if (endOfStoryMatches) {
      if (storyRenderer) {
        storyRenderer.showEndOfStory();
      }
    } else if (line.length > 0) {
      if (storyRenderer) {
        storyRenderer.showText(line);
      }
    }
  }

  return inkErrors;
}

function testThatInklecateIsExecutable(
  mergedSettings: InkConfigurationSettings,
  logger: IConnectionLogger,
  storyPath: string
): Thenable<void> {
  const handleStoryAccessError = (error: any) => {
    const storyErrorMessage = `'mainStoryPath' (${mergedSettings.mainStoryPath}) is not readable.`;
    logger.console.error(`${storyErrorMessage} - ${error.message}`);
    logger.showErrorMessage(storyErrorMessage, false);
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
        logger.console.error(`${inklecateErrorMessage} - ${error.message}`);
        logger.showErrorMessage(inklecateErrorMessage, false);
      })
      .then(() => {
        return Fs.access(storyPath, Fs.constants.R_OK);
      })
      .catch(handleStoryAccessError);
  }
}
