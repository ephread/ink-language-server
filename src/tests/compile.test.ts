// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

jest.mock("uuid/v4", () => () => "00000000-0000-0000-0000-000000000000");

import { Position, Range, TextDocument, WorkspaceFolder } from "vscode-languageserver/lib/main";

import {
  IConnectionLogger,
  InkWorkspace
} from "../types";

import { prepareTempDirectoryForCompilation, updateFile } from "../inklecate";

import * as Fs from "fs";
import * as FsExtra from "fs-extra";
import * as Os from "os";
import * as Path from "path";
import Uri from "vscode-uri";

const defaultUuid = "00000000-0000-0000-0000-000000000000";

const tmpDirectory = Os.tmpdir();
const compileTmpDirectory = Path.join(tmpDirectory, defaultUuid);
const projectDirectory = Path.join(tmpDirectory, "ink-project");

const showErrorMessage = jest.fn();

const consoleError = jest.fn();
const consoleWarn = jest.fn();
const consoleInfo = jest.fn();
const consoleLog = jest.fn();

const logger: IConnectionLogger = {
  console: {
    error: consoleError,
    warn: consoleWarn,
    info: consoleInfo,
    log: consoleLog
  },
  showErrorMessage
};

const workspaceFolder: WorkspaceFolder = {
  uri: `file://${projectDirectory}`,
  name: "ink"
};

describe("prepareTempDirectoryForCompilation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FsExtra.removeSync(compileTmpDirectory);
    FsExtra.removeSync(projectDirectory);
  });

  it("calls the callback with undefined if the temp directory could not be created", done => {
    Fs.mkdirSync(compileTmpDirectory);

    prepareTempDirectoryForCompilation(workspaceFolder, logger, tempDirectory => {
      expect(tempDirectory).toBe(undefined);
      expect(consoleInfo.mock.calls.length).toBe(1);
      expect(consoleError.mock.calls.length).toBe(1);
      done();
    });
  });

  it("calls the callback with undefined if the workspace directory doesn't exist", done => {
    prepareTempDirectoryForCompilation(workspaceFolder, logger, tempDirectory => {
      expect(tempDirectory).toBe(undefined);
      expect(consoleInfo.mock.calls.length).toBe(1);
      expect(consoleError.mock.calls.length).toBe(1);
      done();
    });
  });

  it("calls the callback with undefined if some files could not be copied", done => {
    createFakeProject();
    Fs.chmodSync(Path.join(projectDirectory, "main.ink"), 0o000);

    prepareTempDirectoryForCompilation(workspaceFolder, logger, tempDirectory => {
      expect(tempDirectory).toBe(undefined);
      expect(consoleInfo.mock.calls.length).toBe(1);
      expect(consoleError.mock.calls.length).toBe(1);
      Fs.chmodSync(Path.join(projectDirectory, "main.ink"), 0o700);
      done();
    });
  });

  it("copies correctly", done => {
    createFakeProject();

    prepareTempDirectoryForCompilation(workspaceFolder, logger, tempDirectory => {
      expect(tempDirectory).toBe(compileTmpDirectory);
      expect(consoleInfo.mock.calls.length).toBe(1);

      expect(() => {
        Fs.statSync(Path.join(compileTmpDirectory, "main.ink"));
        Fs.statSync(Path.join(compileTmpDirectory, "story/story.ink2"));
      }).not.toThrow();

      done();
    });
  });

  it("copies only ink files", done => {
    createFakeProject();

    prepareTempDirectoryForCompilation(workspaceFolder, logger, tempDirectory => {
      expect(() => {
        Fs.statSync(Path.join(compileTmpDirectory, "main.ink"));
        Fs.statSync(Path.join(compileTmpDirectory, "story/story.ink2"));
      }).not.toThrow();

      expect(() => {
        Fs.statSync(Path.join(compileTmpDirectory, ".config"));
      }).toThrow();

      done();
    });
  });
});

describe("updateFile", () => {
  const content = "Hello world!\n";

  class TestTextDocument implements TextDocument {
    public uri = `file://${Path.join(projectDirectory, "main.ink")}`;
    public languageId = "";
    public version = 0;
    public lineCount = 0;
    public getText(range?: Range): string {
      return content;
    }
    public positionAt(offset: number): Position {
      return Position.create(0, 0);
    }
    public offsetAt(position: Position): number {
      return 0;
    }
  }

  const textDocument = new TestTextDocument();

  const emptyInkWorkspace: InkWorkspace = {
    folder: workspaceFolder
  };

  const inkWorkspace: InkWorkspace = {
    folder: workspaceFolder,
    temporaryCompilationDirectory: compileTmpDirectory
  };

  beforeEach(() => {
    jest.clearAllMocks();
    FsExtra.removeSync(compileTmpDirectory);
    FsExtra.removeSync(projectDirectory);
  });

  it("Logs an error if the workspace does not exist", done => {
    // tslint:disable-next-line no-empty
    updateFile(textDocument, emptyInkWorkspace, logger, error => {
      expect(error).toBeTruthy();
      done();
    });
  });

  fit("Calls the callback with an error if the file could not be updated", done => {
    const filePath = Path.relative(
      Uri.parse(inkWorkspace.folder.uri).fsPath,
      Uri.parse(textDocument.uri).fsPath
    );

    const temporaryfilePath = Path.join(
      inkWorkspace.temporaryCompilationDirectory!,
      filePath
    );

    createFakeProject();

    prepareTempDirectoryForCompilation(workspaceFolder, logger, tempDirectory => {
      Fs.chmodSync(temporaryfilePath, 0o000);

      updateFile(textDocument, inkWorkspace, logger, error => {
        expect(error).toBeTruthy();
        done();
      });
    });
  });

  it("Updates the file", done => {
    Fs.mkdirSync(Path.join(compileTmpDirectory));
    Fs.closeSync(Fs.openSync(Path.join(compileTmpDirectory, "main.ink"), "w"));

    updateFile(textDocument, inkWorkspace, logger, error => {
      expect(error).toBeFalsy();
      const fileContent = Fs.readFileSync(Path.join(compileTmpDirectory, "main.ink"), "utf8");
      expect(fileContent).toBe(content);

      done();
    });
  });
});

function createFakeProject() {
  Fs.mkdirSync(Path.join(projectDirectory));
  Fs.closeSync(Fs.openSync(Path.join(projectDirectory, "main.ink"), "w"));
  Fs.closeSync(Fs.openSync(Path.join(projectDirectory, ".config"), "w"));
  Fs.mkdirSync(Path.join(projectDirectory, "story"));
  Fs.closeSync(Fs.openSync(Path.join(projectDirectory, "story/story.ink2"), "w"));
}
