// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import { determinePlatform, mergeSettings } from "../helpers/configuration";
import { PartialInkConfigurationSettings, Platform } from "../types/types";

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
  const defaultSettings: PartialInkConfigurationSettings = {
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
