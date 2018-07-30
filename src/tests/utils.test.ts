// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import { DiagnosticSeverity } from "vscode-languageserver";

import { InkErrorType } from "../types";

import {
  getDiagnosticSeverityFromInkErrorType,
  isFilePathChildOfDirPath,
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
