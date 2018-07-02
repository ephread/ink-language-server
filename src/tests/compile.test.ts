// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

jest.mock("uuid/v4", () => () => "00000000-0000-0000-0000-000000000000");

import { IConnection, Position, Range, TextDocument, WorkspaceFolder } from "vscode-languageserver";

import {
  IConnectionLogger,
  InkConfigurationSettings,
  InkWorkspace,
  PartialInkConfigurationSettings
} from "../types";

import { prepareTempDirectoryForCompilation, updateFile } from "../compile";

import * as Fs from "fs";
import * as FsExtra from "fs-extra";
import * as Os from "os";
import * as Path from "path";

const defaultUuid = "00000000-0000-0000-0000-000000000000";

const tmpDirectory = Os.tmpdir();
const compileTmpDirectory = Path.join(tmpDirectory, defaultUuid);
const projectDirectory = Path.join(tmpDirectory, "ink-project");

const log = jest.fn();
const showErrorMessage = jest.fn();

const logger: IConnectionLogger = { log, showErrorMessage };

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
      expect(log.mock.calls.length).toBe(2); // Accounting for the very first info log call.
      done();
    });
  });

  it("log an error silently if the workspace directory doesn't exist", done => {
    prepareTempDirectoryForCompilation(workspaceFolder, logger, tempDirectory => {
      expect(tempDirectory).toBe(compileTmpDirectory);
      expect(log.mock.calls.length).toBe(2); // Accounting for the very first info log call.
      done();
    });
  });

  it("calls the callback with undefined if some files could not be copied", done => {
    createFakeProject();
    Fs.chmodSync(Path.join(projectDirectory, "main.ink"), 0o000);

    prepareTempDirectoryForCompilation(workspaceFolder, logger, tempDirectory => {
      expect(tempDirectory).toBe(undefined);
      expect(log.mock.calls.length).toBe(2); // Accounting for the very first info log call.
      Fs.chmodSync(Path.join(projectDirectory, "main.ink"), 0o700);
      done();
    });
  });

  it("copies correctly", done => {
    createFakeProject();

    prepareTempDirectoryForCompilation(workspaceFolder, logger, tempDirectory => {
      expect(tempDirectory).toBe(compileTmpDirectory);
      expect(log.mock.calls.length).toBe(1); // Accounting for the very first info log call.

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

  const textDocument = new TestTextDocument;

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

  it("Log an error and does nothing if the workspace does not exist", done => {
    // tslint:disable-next-line no-empty
    updateFile(textDocument, emptyInkWorkspace, logger, error => {});
    expect(log.mock.calls.length).toBe(1);
    done();
  });

  it("Calls the callback an error if the file could not be updated", done => {
    updateFile(textDocument, inkWorkspace, logger, error => {
      expect(error).toBeTruthy();
      done();
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
