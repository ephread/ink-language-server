// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as Fs from "fs-extra";
import * as Path from "path";

import {
  InkConfigurationSettings,
  PartialInkConfigurationSettings,
  Platform
} from "../types/types";

/**
 * The global settings, used when the `workspace/configuration` request is not supported
 * by the client.
 */
export let defaultSetting: InkConfigurationSettings = getDefaultSettings();
export let areDefaultSettingsDirty = true;

export function flagDefaultSettingsAsDirty() {
  areDefaultSettingsDirty = true;
}

export function getDefaultSettings() {
  if (areDefaultSettingsDirty) {
    areDefaultSettingsDirty = false;
    defaultSetting = {
      inklecateExecutablePath: defaultInklecatePath(determinePlatform()),
      mainStoryPath: "main.ink",
      runThroughMono: isRunThroughMono()
    };
  }

  return defaultSetting;
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
    return Path.join(__dirname, "../..", "vendor/inklecate.exe");
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

export function getMonoPath(runThroughMono: string | boolean | undefined): string | undefined {
  if (typeof runThroughMono === 'string') {
    return runThroughMono;
  } else {
    return runThroughMono ? 'mono' : undefined;
  }
}

/**
 * Returns the default path to inklecate, when running the server on macOS.
 */
function defaultMacInklecatePath(): string {
  return Path.join(__dirname, "../..", "vendor/inklecate");
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
