// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as ChildProcess from "child_process";
import * as Fs from "fs-extra";
import * as Os from "os";
import * as Path from "path";

import * as Uuid from "uuid/v4";

import { IConnection, TextDocument, WorkspaceFolder } from "vscode-languageserver";
import {
  IConnectionLogger,
  InkConfigurationSettings,
  InkError,
  InkErrorType,
  InkWorkspace,
  PartialInkConfigurationSettings,
  Platform
} from "./types";
import {
  defaultInklecatePath,
  determinePlatform,
  getPathFromUri,
  isRunThroughMono,
  mergeSettings
} from "./utils";

/* Constants */
/******************************************************************************/
const INK_EXTENSIONS = ["ink", "ink2"];

/**
 * The global settings, used when the `workspace/configuration` request is not supported
 * by the client.
 */
export const DEFAULT_SETTINGS: InkConfigurationSettings = {
  inklecateExecutablePath: defaultInklecatePath(determinePlatform()),
  mainStoryPath: "main.ink",
  runThroughMono: isRunThroughMono()
};

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
  const workspacePath = getPathFromUri(workspaceFolder.uri);

  // Make the temporary directory and copy the ink files in it.
  Fs.mkdir(tempDirectory, mkDirError => {
    if (mkDirError) {
      logger.log(mkDirError.message);
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
              logger.log(error.message);
              return false;
            }
          }
        },
        copyError => {
          if (copyError) {
            logger.log(copyError.message);
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
  callback: (error: Error) => void
) {
  if (!workspace.folder || !workspace.temporaryCompilationDirectory) {
    return;
  }

  const workspacePath = getPathFromUri(workspace.folder.uri);
  const documentContent = document.getText();
  const path = getPathFromUri(document.uri);

  const regex = new RegExp(`^${workspacePath}`);
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
  completion: (errors: InkError[]) => void
) {
  const tempDir = inkWorkspace.temporaryCompilationDirectory;
  if (!tempDir) {
    logger.log(`Temporary directory for ${inkWorkspace.folder.name} is \`undefined\`, ignoring…`);
    return;
  }

  const mergedSettings = mergeSettings(settings, DEFAULT_SETTINGS);

  const mainStoryTempPath = Path.join(tempDir, mergedSettings.mainStoryPath);

  // Though checking these beforehand is subjected to race conditions, it's useful as it'll
  // give the user a hint about what may be going wrong.
  Fs.access(mergedSettings.inklecateExecutablePath, Fs.constants.X_OK)
    .catch(error => {
      const inklecateErrorMessage = `'inklecatePath' (${
        mergedSettings.inklecateExecutablePath
      }) is not executable.`;
      logger.log(error.message);
      logger.showErrorMessage(inklecateErrorMessage);
    })
    .then(() => {
      return Fs.access(mainStoryTempPath, Fs.constants.R_OK);
    })
    .catch(error => {
      const storyErrorMessage = `'mainStoryPath' (${
        mergedSettings.mainStoryPath
      }) is not readable.`;
      logger.log(error.message);
      logger.showErrorMessage(storyErrorMessage);
    })
    .then(() => {
      spawnInklecate(mergedSettings, mainStoryTempPath, inkWorkspace, logger, completion);
    });
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
  completion: (errors: InkError[]) => void
) {
  const command = settings.runThroughMono ? "mono" : settings.inklecateExecutablePath;
  const args = settings.runThroughMono
    ? [settings.inklecateExecutablePath, mainStoryTempPath]
    : [mainStoryTempPath];

  const inklecateProcess = ChildProcess.spawn(command, args, {
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

    logger.log(error.message);
    logger.showErrorMessage(
      inklecateMessage + possibleReasons.join(" or ") + ". Please see the log for more details."
    );
  });

  inklecateProcess.stderr.setEncoding("utf8");
  inklecateProcess.stderr.on("data", text => {
    if (typeof text === "string") {
      // Strip Byte order mark
      text = text.replace(/^\uFEFF/, "");

      if (text.length > 0) {
        const inklecateMessage = "Inklecate returned an error, see the log for more details.";
        logger.log(text);
        logger.showErrorMessage(inklecateMessage);
      }
    }
  });

  inklecateProcess.stdout.setEncoding("utf8");
  inklecateProcess.stdout.on("data", text => {
    if (typeof text === "string") {
      const errors = parseInklecateOutput(text, Path.dirname(settings.mainStoryPath), inkWorkspace);
      completion(errors);
    }
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
function parseInklecateOutput(
  text: string,
  mainStoryPathPrefix: string,
  workspace: InkWorkspace
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
    const errorMatches = trimmedLine.match(
      /^(ERROR|WARNING|RUNTIME ERROR|RUNTIME WARNING|TODO): ('([^']+)' )?line (\d+): (.+)/
    );

    if (errorMatches) {
      const errorType = InkErrorType.parse(errorMatches[1]);
      const path =
        "file://" +
        Path.join(getPathFromUri(workspace.folder.uri), mainStoryPathPrefix, errorMatches[3]);

      if (errorType) {
        inkErrors.push({
          filePath: path,
          lineNumber: parseInt(errorMatches[4]),
          message: errorMatches[5],
          type: errorType
        });
      }
    } else if (line.length > 0) {
      break;
    }
  }

  return inkErrors;
}
