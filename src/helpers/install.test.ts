import * as Fs from "fs-extra";
import * as Os from "os";
import * as Path from "path";

import {
  createConnection,
  ProposedFeatures
} from "vscode-languageserver/lib/main";

import DocumentManager from "../helpers/Class/DocumentManager";
import DiagnosticManager from "../helpers/Class/DiagnosticManager";
import CompilationDirectoryManager from "../helpers/Class/CompilationDirectoryManager";
import StoryRenderer from "../helpers/Class/StoryRenderer";
import InklecateBackend from "../backends/InklecateBackend";
import WorkspaceManager from "../helpers/Class/WorkspaceManager";

import mockedLogger from "../tests/helpers/logger";
import {
  checkPlatformAndDownloadBinaryDependency
} from "../helpers/install";


Object.defineProperty(process, "argv", { value: ["foo", "bar", "--stdio"] })
const connection = createConnection(ProposedFeatures.all);
const logger = mockedLogger.logger;
const documentManager = new DocumentManager();
const diagnosticManager = new DiagnosticManager(connection, documentManager, logger);
const compilationDirectoryManager = new CompilationDirectoryManager(logger);
const storyRenderer = new StoryRenderer(connection);
const inklecateBackend = new InklecateBackend(storyRenderer, diagnosticManager, logger);
const workspaceManager = new WorkspaceManager(
  connection,
  documentManager,
  compilationDirectoryManager,
  inklecateBackend,
  logger
);

describe("checkPlatformAndDownloadBinaryDependency", () => {
  const tmpDirectory = Path.join(Os.tmpdir(), "ink.language.server.install.test");
  const directoryPath = Path.join(tmpDirectory, "foo");
  const filePath = Path.join(directoryPath, 'fakeInklecate');

  beforeAll(() => {
    Fs.mkdirpSync(directoryPath);
    Fs.closeSync(Fs.openSync(Path.join(directoryPath, "fakeInklecate"), 'w'));
  });

  it("returns false when given a specific, bogus inklecate path", () => {
    workspaceManager.initializationOptions.inklecateExecutablePath = "foo"
    checkPlatformAndDownloadBinaryDependency(workspaceManager, logger, result => {
      expect(result).toEqual(false);
    })
  });

  it("returns true when given a specific, real inklecate path", () => {
    workspaceManager.initializationOptions.inklecateExecutablePath = filePath;
    checkPlatformAndDownloadBinaryDependency(workspaceManager, logger, result => {
      expect(result).toEqual(true);
    })
  });

  afterAll(() => {
    Fs.removeSync(directoryPath);
  });

});
