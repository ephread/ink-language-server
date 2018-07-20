// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as Fs from "fs-extra";
import * as Path from "path";

import { DiagnosticSeverity } from "vscode-languageserver";

import {
  InkConfigurationSettings,
  InkErrorType,
  PartialInkConfigurationSettings,
  Platform,
} from "./types";

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

export function determinePlatform(): Platform {
  if (process.platform === "win32") {
      return Platform.Windows;
  } else if (process.platform === "darwin") {
      return Platform.MacOs;
  }

  return Platform.Other;
}

/**
 * Returns true if the current setup requires Inklecate to be run through mono.
 */
export function isRunThroughMono() {
  const platform = determinePlatform();
  const isMacInklecateValid = (platform === Platform.MacOs && isDefaultMacOsInklecateInstalled());

  return !isMacInklecateValid && platform !== Platform.Windows;
}

/**
 * Returns the default path to inklecate depending on the given Platform.
 *
 * @param platform the Platform for which return the default inklecate path.
 */
export function defaultInklecatePath(platform: Platform): string {
  if (platform === Platform.MacOs && isDefaultMacOsInklecateInstalled()) {
    return defaultMacInklecatePath();
  } else {
    return Path.join(__dirname, "..", "vendor/inklecate.exe");
  }
}

/**
 * Merge the given settings with the default one,
 * replacing any empty or undefined values.
 *
 * @param settings the provided configuration settings.
 * @param defaultSettings the default settings to use if values are empty or undefined.
 */
export function mergeSettings(
  settings: PartialInkConfigurationSettings,
  defaultSettings: InkConfigurationSettings
): InkConfigurationSettings {
  let inklecatePath = settings.inklecateExecutablePath;
  let mainStoryPath = settings.mainStoryPath;
  let runThroughMono = settings.runThroughMono;

  if (typeof inklecatePath === "undefined" || !inklecatePath || inklecatePath.length === 0) {
    inklecatePath = defaultSettings.inklecateExecutablePath as string;
  }

  if (typeof mainStoryPath === "undefined" || !mainStoryPath || mainStoryPath.length === 0) {
    mainStoryPath = defaultSettings.mainStoryPath as string;
  }

  if (typeof runThroughMono === "undefined") {
    runThroughMono = defaultSettings.runThroughMono as boolean;
  }

  return {
    inklecateExecutablePath: inklecatePath,
    mainStoryPath,
    runThroughMono
  };
}

/**
 * Returns given string with escaped characters, for use as a regular expression pattern.
 *
 * @param source the string to escape
 */
export function escapeForRegExp(source: string): string {
  return source.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Returns the default path to inklecate, when running the server on macOS.
 */
function defaultMacInklecatePath(): string {
  return Path.join(__dirname, "..", "vendor/inklecate");
}

/**
 * Return true if the default macos prebuilt binary was
 * successfully downloaded un unpacked.
 */
function isDefaultMacOsInklecateInstalled() {
  try {
    const stat = Fs.statSync(defaultMacInklecatePath());
    return true;
  } catch (error) {
    return false;
  }
}
