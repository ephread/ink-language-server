// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import { DiagnosticSeverity } from "vscode-languageserver";

import {
  InkConfigurationSettings,
  InkErrorType,
  PartialInkConfigurationSettings,
  Platform
} from "../types";
import {
  determinePlatform,
  getDiagnosticSeverityFromInkErrorType,
  isFilePathChildOfDirPath,
  isRunThroughMono,
  mergeSettings
} from "../utils";

describe("isFilePathChildOfDirPath", () => {
  it("returns true when the given file is a child of the given directory", () => {
    expect(isFilePathChildOfDirPath("path/to/file", "path/to")).toBeTruthy();
    expect(isFilePathChildOfDirPath("path/file", "path/to/..")).toBeTruthy();
    expect(isFilePathChildOfDirPath("path/to/../file", "path/")).toBeTruthy();

    expect(isFilePathChildOfDirPath("/path/to/file", "/path/to")).toBeTruthy();
    expect(isFilePathChildOfDirPath("/path/file", "/path/to/..")).toBeTruthy();
    expect(isFilePathChildOfDirPath("/path/to/../file", "/path/")).toBeTruthy();

    expect(isFilePathChildOfDirPath("./path/to/file", "./path/to")).toBeTruthy();
    expect(isFilePathChildOfDirPath("./path/file", "./path/to/..")).toBeTruthy();
    expect(isFilePathChildOfDirPath("./path/to/../file", "./path/")).toBeTruthy();

    expect(isFilePathChildOfDirPath("C:/path/to/file", "C:/path/to")).toBeTruthy();
    expect(isFilePathChildOfDirPath("C:/path/file", "C:/path/to/..")).toBeTruthy();
    expect(isFilePathChildOfDirPath("C:/path/to/../file", "C:/path/")).toBeTruthy();
  });

  it("returns false when the given file is not a child of the given directory", () => {
    expect(isFilePathChildOfDirPath("path/to/file", "path/from")).toBeFalsy();
    expect(isFilePathChildOfDirPath("path/file", "path/from/directory/..")).toBeFalsy();
    expect(isFilePathChildOfDirPath("path/to/../file", "newpath/")).toBeFalsy();

    expect(isFilePathChildOfDirPath("/path/to/file", "/path/from")).toBeFalsy();
    expect(isFilePathChildOfDirPath("/path/file", "/path/from/directory/..")).toBeFalsy();
    expect(isFilePathChildOfDirPath("/path/to/../file", "/newpath/")).toBeFalsy();

    expect(isFilePathChildOfDirPath("./path/to/file", "./path/from")).toBeFalsy();
    expect(isFilePathChildOfDirPath("./path/file", "./path/from/directory/..")).toBeFalsy();
    expect(isFilePathChildOfDirPath("./path/to/../file", "./newpath/")).toBeFalsy();

    expect(isFilePathChildOfDirPath("C:/path/to/file", "C:/path/from")).toBeFalsy();
    expect(isFilePathChildOfDirPath("C:/path/file", "C:/path/from/directory/..")).toBeFalsy();
    expect(isFilePathChildOfDirPath("C:/path/to/../file", "C:/newpath/")).toBeFalsy();
  });
});

describe("getDiagnosticSeverityFromInkErrorType", () => {
  it("returns the correct DiagnosticSeverity", () => {
    expect(getDiagnosticSeverityFromInkErrorType(InkErrorType.RuntimeError)).toEqual(
      DiagnosticSeverity.Error
    );

    expect(getDiagnosticSeverityFromInkErrorType(InkErrorType.Error)).toEqual(
      DiagnosticSeverity.Error
    );

    expect(getDiagnosticSeverityFromInkErrorType(InkErrorType.RuntimeWarning)).toEqual(
      DiagnosticSeverity.Warning
    );

    expect(getDiagnosticSeverityFromInkErrorType(InkErrorType.Warning)).toEqual(
      DiagnosticSeverity.Warning
    );

    expect(getDiagnosticSeverityFromInkErrorType(InkErrorType.Todo)).toEqual(
      DiagnosticSeverity.Information
    );
  });
});

describe("determinePlatform", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the correct platform for Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    expect(determinePlatform()).toEqual(Platform.Windows);
  });

  it("returns the correct platform for macOS", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    expect(determinePlatform()).toEqual(Platform.MacOs);
  });

  it("returns the correct platform for unknown plateform", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    expect(determinePlatform()).toEqual(Platform.Other);
  });
});

describe("mergeSettings", () => {
  const defaultSettings: InkConfigurationSettings = {
    mainStoryPath: "main.ink",
    inklecateExecutablePath: "inklecate",
    runThroughMono: false
  };

  it("doesn't replace already set properties", () => {
    const settings: PartialInkConfigurationSettings = {
      mainStoryPath: "mainStoryPath",
      inklecateExecutablePath: "inklecateExecutablePath",
      runThroughMono: true
    };

    expect(mergeSettings(settings, defaultSettings)).toEqual(settings);
  });

  it("only adds missing properties", () => {
    const settings: PartialInkConfigurationSettings = {
      mainStoryPath: "mainStoryPath"
    };

    expect(mergeSettings(settings, defaultSettings)).toEqual({
      mainStoryPath: "mainStoryPath",
      inklecateExecutablePath: "inklecate",
      runThroughMono: false
    });
  });

  it("returns the default settings is the provided settings are empty", () => {
    const settings: PartialInkConfigurationSettings = {};
    expect(mergeSettings(settings, defaultSettings)).toEqual(defaultSettings);
  });
});
