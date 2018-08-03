// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as Fs from "fs-extra";
import * as Os from "os";
import * as Path from "path";
import * as Uuid from "uuid/v4";

import {
  TextDocument,
  WorkspaceFolder
} from "vscode-languageserver/lib/main";

import URI from "vscode-uri/lib/umd";

import {
  IConnectionLogger,
  InkWorkspace
} from "../../types/types";

import { isInkFile } from '../utils';

/**
 *
 */
export default class CompilationDirectoryManager {

  constructor(private logger: IConnectionLogger) { }

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
  public prepareTempDirectoryForCompilation(
    workspaceFolder: WorkspaceFolder
  ): Promise<string | void> {
    this.logger.console.info(`Creating temporary compilation directory for: '${workspaceFolder.name}'.`);

    const tempDirectory = Path.join(Os.tmpdir(), Uuid());
    const workspacePath = URI.parse(workspaceFolder.uri).fsPath;

    return Fs.mkdir(tempDirectory).then(() => {
      this.logger.console.info(`'${workspaceFolder.name}': Mirror directory created.`);

      return Fs.copy(workspacePath, tempDirectory, {
        filter: (src: string, dest: string) => {
          try {
            const isDir = Fs.lstatSync(src).isDirectory();
            if (isDir) { return true; }

            return isInkFile(src, false, this.logger);
          } catch (error) {
            this.logger.console.warn(
              `File '${src}' doesn't exist and will be ignored. - ${error.message}`
            );
            return false;
          }
        }
      }).catch((error) => {
        this.logger.console.error(`Could not copy files: ${error.message}`);
        return Promise.reject(error);
      });
    }, (error) => {
      this.logger.console.error(`Could not create temporary compilation directory: ${error.message}`);
      return Promise.reject(error);
    }).then(() => {
      this.logger.console.info(`'${workspaceFolder.name}': File hierarchy copied.`);
      return Promise.resolve(tempDirectory);
    });
  }

  public async copyNewlyCreatedFile(
    fileUri: string,
    workspace: InkWorkspace,
  ) {
    const filePath = URI.parse(fileUri).fsPath;
    const basename = Path.basename(filePath);

    if (!isInkFile(filePath, true, this.logger)) { return; }

    if (!workspace.temporaryCompilationDirectory) {
      this.logger.console.warn(`The temporary compilation directory is undefined, cannot copy ${fileUri}.`);
      const message = `The server could not process '${filePath}'. ` +
                      'As subsequent compilations may fail, you should reload your project.';
      this.logger.showWarningMessage(message, true);
      return;
    }

    const workspaceFolderPath = URI.parse(workspace.folder.uri).fsPath;

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
        this.logger.console.error(`Could not create new file in the compilation directory: ${error.message}`);
        this.logger.showErrorMessage(erroMessage, false);
      })
      .then(() => {
        return Fs.copy(filePath, temporaryFilePath);
      })
      .catch(error => {
        this.logger.console.error(`Could not create new file in the compilation directory: ${error.message}`);
        this.logger.showErrorMessage(erroMessage, false);
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
  public updateFile(
    document: TextDocument,
    workspace: InkWorkspace
  ): Promise<void> {
    if (!workspace.folder || !workspace.temporaryCompilationDirectory) {
      return Promise.reject(new Error(`Could not update file: ${document.uri}`));
    }

    const workspacePath = URI.parse(workspace.folder.uri).fsPath;
    const documentContent = document.getText();
    const path = URI.parse(document.uri).fsPath;

    const relativePath = Path.relative(workspacePath, path);
    const fullPath = Path.join(workspace.temporaryCompilationDirectory, relativePath);

    return Fs.mkdirp(Path.dirname(fullPath)).then(() => {
      return Fs.writeFile(fullPath, documentContent);
    });
  }
}
