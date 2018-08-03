// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as Fs from "fs-extra";
import * as Os from "os";
import * as Path from "path";

import { DiagnosticSeverity } from "vscode-languageserver";

import { InkErrorType } from "../types/types";

import {
  getDiagnosticSeverityFromInkErrorType,
  isFilePathChildOfDirPath,
  isInkFile
} from "../helpers/utils";

import mockedLogger from '../tests/helpers/logger';

const tmpDirectory = Path.join(Os.tmpdir(), "ink.language.server.utils.test");

const logger = mockedLogger.logger;
const mocks = mockedLogger.mocks;

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

describe("isInkFile", () => {
  describe("allowing directories", () => {
    it("returns true", () => {
      expect(isInkFile('/path/to/file/foo.ink', true, logger)).toBeTruthy();
      expect(isInkFile('/path/to/file/foo.ink2', true, logger)).toBeTruthy();
      expect(isInkFile('foo.bar.ink', true, logger)).toBeTruthy();
      expect(isInkFile('bar.foo.ink2', true, logger)).toBeTruthy();
    });

    it("returns false", () => {
      expect(isInkFile('ink', true, logger)).toBeFalsy();
      expect(isInkFile('foobar', true, logger)).toBeFalsy();
      expect(isInkFile('/path/to/file/foo.bar', true, logger)).toBeFalsy();
      expect(isInkFile('bar.foo', true, logger)).toBeFalsy();
    });
  });

  describe("not allowing directories", () => {
    const directoryPath = Path.join(tmpDirectory, 'foo');
    const filePath = Path.join(directoryPath, 'main.ink');

    beforeAll(() => {
      Fs.mkdirpSync(directoryPath);
      Fs.closeSync(Fs.openSync(Path.join(directoryPath, 'main.ink'), 'w'));
    });

    it("returns true", () => {
      expect(isInkFile(filePath, false, logger)).toBeTruthy();
    });

    it("returns false", () => {
      expect(isInkFile(directoryPath, false, logger)).toBeFalsy();
    });

    it("log a warning if the file doesn't exist", () => {
      expect(isInkFile('/????', false, logger)).toBeFalsy();
      expect(mocks.consoleWarn.mock.calls.length).toBe(1);
    });

    afterAll(() => {
      Fs.removeSync(directoryPath);
    });
  });
});
