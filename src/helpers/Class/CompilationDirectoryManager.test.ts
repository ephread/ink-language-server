// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

jest.mock("uuid/v4", () => () => "00000000-0000-0000-0000-000000000000");

import { Position, Range, TextDocument, WorkspaceFolder } from "vscode-languageserver";

import {
  IConnectionLogger,
  InkWorkspace
} from "../../types/types";

import mockedLogger from '../../tests/helpers/logger';

import CompilationDirectoryManager from "../../helpers/Class/CompilationDirectoryManager";

import * as Fs from "fs";
import * as FsExtra from "fs-extra";
import * as Os from "os";
import * as Path from "path";
import Uri from "vscode-uri";

const defaultUuid = "00000000-0000-0000-0000-000000000000";

const tmpDirectory = Os.tmpdir();
const compileTmpDirectory = Path.join(tmpDirectory, defaultUuid);
const projectDirectory = Path.join(tmpDirectory, "ink-project");

const workspaceFolder: WorkspaceFolder = {
  uri: `file://${projectDirectory}`,
  name: "ink"
};

const logger = mockedLogger.logger;
const mocks = mockedLogger.mocks;

const directoryManager = new CompilationDirectoryManager(logger);

describe("prepareTempDirectoryForCompilation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FsExtra.removeSync(compileTmpDirectory);
    FsExtra.removeSync(projectDirectory);
  });

  it("reject the promise if the temp directory could not be created", done => {
    Fs.mkdirSync(compileTmpDirectory);

    directoryManager.prepareTempDirectoryForCompilation(workspaceFolder).then(() => {
      fail('then() should not have been called.');
    }).catch(() => {
      expect(mocks.consoleInfo.mock.calls.length).toBe(1);
      expect(mocks.consoleError.mock.calls.length).toBe(1);
      done();
    });
  });

  it("reject the promise if the workspace directory doesn't exist", done => {
    directoryManager.prepareTempDirectoryForCompilation(workspaceFolder).then(() => {
      fail('then() should not have been called.');
      done();
    }).catch(() => {
      expect(mocks.consoleInfo.mock.calls.length).toBe(2);
      expect(mocks.consoleError.mock.calls.length).toBe(1);
      done();
    });
  });

  it("reject the promise if some files could not be copied", done => {
    createFakeProject();
    Fs.chmodSync(Path.join(projectDirectory, "main.ink"), 0o000);

    directoryManager.prepareTempDirectoryForCompilation(workspaceFolder).then(() => {
      fail('then() should not have been called.');
      done();
    }).catch(() => {
      expect(mocks.consoleInfo.mock.calls.length).toBe(2);
      expect(mocks.consoleError.mock.calls.length).toBe(1);
      Fs.chmodSync(Path.join(projectDirectory, "main.ink"), 0o700);
      done();
    });
  });

  it("copies correctly", done => {
    createFakeProject();

    directoryManager.prepareTempDirectoryForCompilation(workspaceFolder).then((tempDirectory) => {
      expect(tempDirectory).toBe(compileTmpDirectory);
      expect(mocks.consoleInfo.mock.calls.length).toBe(3);

      expect(() => {
        Fs.statSync(Path.join(compileTmpDirectory, "main.ink"));
        Fs.statSync(Path.join(compileTmpDirectory, "story/story.ink2"));
      }).not.toThrow();

      done();
    }).catch(() => {
      fail('catch() should not have been called.');
      done();
    });
  });

  it("copies only ink files", done => {
    createFakeProject();

    directoryManager.prepareTempDirectoryForCompilation(workspaceFolder).then((tempDirectory) => {
      expect(() => {
        Fs.statSync(Path.join(compileTmpDirectory, "main.ink"));
        Fs.statSync(Path.join(compileTmpDirectory, "story/story.ink2"));
      }).not.toThrow();

      expect(() => {
        Fs.statSync(Path.join(compileTmpDirectory, ".config"));
      }).toThrow();

      done();
    }).catch(() => {
      fail('catch() should not have been called.');
      done();
    });
  });
});

// describe("copyNewlyCreatedFile", () => {

// });

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
    directoryManager.updateFile(textDocument, emptyInkWorkspace).then(() => {
      fail('then() should not have been called.');
    }).catch((error) => {
      expect(error).toBeTruthy();
      done();
    });
  });

  it("Calls the callback with an error if the file could not be updated", done => {
    const filePath = Path.relative(
      Uri.parse(inkWorkspace.folder.uri).fsPath,
      Uri.parse(textDocument.uri).fsPath
    );

    const temporaryfilePath = Path.join(
      inkWorkspace.temporaryCompilationDirectory!,
      filePath
    );

    createFakeProject();

    directoryManager.prepareTempDirectoryForCompilation(workspaceFolder).then((tempDirectory) => {
      Fs.chmodSync(temporaryfilePath, 0o000);

      directoryManager.updateFile(textDocument, inkWorkspace).then(() => {
        fail('then() should not have been called.');
      }).catch((error) => {
        expect(error).toBeTruthy();
        done();
      });
    });
  });

  it("Updates the file", done => {
    Fs.mkdirSync(Path.join(compileTmpDirectory));
    Fs.closeSync(Fs.openSync(Path.join(compileTmpDirectory, "main.ink"), "w"));

    directoryManager.updateFile(textDocument, inkWorkspace).then(() => {
      const fileContent = Fs.readFileSync(Path.join(compileTmpDirectory, "main.ink"), "utf8");
      expect(fileContent).toBe(content);

      done();
    }).catch(() => {
      fail('catch() should not have been called.');
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
