// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as ChildProcess from "child_process";
import * as Fs from "fs-extra";
import * as Os from "os";
import * as Path from "path";
import * as Uuid from "uuid/v4";

import Uri from "vscode-uri/lib/umd";

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
} from "./types";

import { escapeForRegExp } from "./utils";

import { determinePlatform, getDefaultSettings, getMonoPath, mergeSettings } from "./configuration";

import { StoryRenderer } from "./story-renderer";

/* Constants */
/******************************************************************************/
const INK_EXTENSIONS = ["ink", "ink2"];

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
  logger: IConnectionLogger,
  callback: (tempDirectory: string | undefined) => void
) {
  logger.log(`Creating temporary compile directory for: ${workspaceFolder.name}`);

  const tempDirectory = Path.join(Os.tmpdir(), Uuid());
  const workspacePath = Uri.parse(workspaceFolder.uri).fsPath;

  // Make the temporary directory and copy the ink files in it.
  Fs.mkdir(tempDirectory, mkDirError => {
    if (mkDirError) {
      logger.log(`Could not create temporary compile directory: ${mkDirError.message}`);
      callback(undefined);
    } else {
      Fs.copy(
        workspacePath,
        tempDirectory,
        {
          filter: (src: string, dest: string) => {
            try {
              const isDir = Fs.lstatSync(src).isDirectory();
              const isInk = INK_EXTENSIONS.indexOf(src.split(".").pop() || "") > -1;
              return isDir || isInk;
            } catch (error) {
              logger.log(
                `WARNING: File '${src}' doesn't exist and will be ignored. - ${error.message}`
              );
              return false;
            }
          }
        },
        copyError => {
          if (copyError) {
            logger.log(`Could not copy files: ${copyError.message}`);
            callback(undefined);
          } else {
            callback(tempDirectory);
          }
        }
      );
    }
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
    logger.log(`Could not update file: ${document.uri}`);
    return;
  }

  const workspacePath = Uri.parse(workspace.folder.uri).fsPath;
  const documentContent = document.getText();
  const path = Uri.parse(document.uri).fsPath;

  const regex = new RegExp(`^${escapeForRegExp(workspacePath)}`);
  const relativePath = path.replace(regex, "");
  const fullPath = Path.join(workspace.temporaryCompilationDirectory, relativePath);

  Fs.writeFile(fullPath, documentContent, callback);
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
  compileCallback: (inkWorkspace: InkWorkspace, outputStoryPath: string, errors: InkError[]) => void
) {
  const tempDir = inkWorkspace.temporaryCompilationDirectory;
  if (!tempDir) {
    logger.log(`Temporary directory for ${inkWorkspace.folder.name} is \`undefined\`, ignoring…`);
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
      compileCallback
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
 * @param mainStoryTempPath the path to the main ink file (in the temporary compile directory).
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
  compileCallback: (inkWorkspace: InkWorkspace, outputStoryPath: string, errors: InkError[]) => void
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

    logger.log(`${inklecateMessage} ${possibleReasons.join(" or ")}. - ${error.message}`);
    logger.showErrorMessage(
      `${inklecateMessage} ${possibleReasons.join(" or ")}. Please see the log for more details.`
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
        logger.log(`${inklecateMessage}: ${text}`);
        logger.showErrorMessage(inklecateMessage);
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
    compileCallback(inkWorkspace, outputStoryPath, errors);
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
    const storyErrorMessage = `'mainStoryPath' (${
      mergedSettings.mainStoryPath
    }) is not readable.`;
    logger.log(`${storyErrorMessage} - ${error.message}`);
    logger.showErrorMessage(storyErrorMessage);
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
      logger.log(`${inklecateErrorMessage} - ${error.message}`);
      logger.showErrorMessage(inklecateErrorMessage);
    })
    .then(() => {
      return Fs.access(storyPath, Fs.constants.R_OK);
    })
    .catch(handleStoryAccessError);
  }
}
