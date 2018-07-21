// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as Path from "path";

import { DiagnosticSeverity } from "vscode-languageserver";

import { InkErrorType } from "./types";

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

/**
 * Returns given string with escaped characters, for use as a regular expression pattern.
 *
 * @param source the string to escape
 */
export function escapeForRegExp(source: string): string {
  return source.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
}
