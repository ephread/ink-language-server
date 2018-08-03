// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as Fs from "fs-extra";
import * as Path from "path";

import { DiagnosticSeverity } from "vscode-languageserver/lib/main";

import { IConnectionLogger, InkErrorType } from "../types/types";

const INK_EXTENSIONS = ["ink", "ink2"];

/**
 * Returns `true` if `filePath` point to a file that is a child of
 * the directory `dirPath` points to.
 *
 * @param filePath path to he file.
 * @param dirPath path to the directory.
 */
export function isFilePathChildOfDirPath(filePath: string, dirPath: string) {
  const relative = Path.relative(dirPath, filePath);
  return !!relative && !relative.startsWith("..") && !Path.isAbsolute(relative);
}

/**
 * Transform an InkErrorType into its equivalent DiagnosticSeverity.
 * @param type the InkErrorType to transform.
 */
export function getDiagnosticSeverityFromInkErrorType(type: InkErrorType): DiagnosticSeverity {
  switch (type) {
    case InkErrorType.RuntimeError:
    case InkErrorType.Error:
      return DiagnosticSeverity.Error;

    case InkErrorType.RuntimeWarning:
    case InkErrorType.Warning:
      return DiagnosticSeverity.Warning;

    case InkErrorType.Todo:
      return DiagnosticSeverity.Information;
  }
}

export function isInkFile(filePath: string, testIfDirectory: boolean, logger: IConnectionLogger) {
  try {
    if (testIfDirectory) {
      if (Fs.lstatSync(filePath).isDirectory()) { return false; }
    }

    const extension = filePath.split(".").pop() || "";
    if (filePath === extension) { return false; }

    const isInk = (INK_EXTENSIONS.indexOf(extension) > -1);
    return isInk;
  } catch (error) {
    logger.console.warn(
      `File '${filePath}' doesn't exist and will be ignored. - ${error.message}`
    );

    return false;
  }
}
