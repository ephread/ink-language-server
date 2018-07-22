// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

export enum Commands {
  compileStory = "compile-story",
  playStory = "play-story",
  killInklecate = "kill-inklecate",
  selectOption = "select-option"
}

export enum CompilationNotification {
  didCompileStory = "inkWorkspace/didCompileStory",
}

export enum RuntimeNotification {
  text = "inkRuntime/text",
  tag = "inkRuntime/tag",
  choice = "inkRuntime/choice",
  prompt = "inkRuntime/prompt",
  endOfStory = "inkRuntime/endOfStory",
  error = "inkRuntime/error"
}
