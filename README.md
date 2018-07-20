# ![Ink Language Server](https://i.imgur.com/pQwWZ9X.png)

[![Build Status](https://travis-ci.org/ephread/ink-language-server.svg?branch=master)](https://travis-ci.org/ephread/ink-language-server)
[![codebeat badge](https://codebeat.co/badges/e7ea4d8e-732c-4320-8815-1f150f44507e)](https://codebeat.co/projects/github-com-ephread-ink-language-server-master)
[![codecov](https://codecov.io/gh/ephread/ink-language-server/branch/master/graph/badge.svg)](https://codecov.io/gh/ephread/ink-language-server)
[![npm version](https://img.shields.io/npm/v/ink-language-server.svg)](https://www.npmjs.com/package/ink-language-server)
[![Install Size](https://packagephobia.now.sh/badge?p=rollup)](https://packagephobia.now.sh/result?p=ink-language-server)
[![Install Size](https://img.shields.io/npm/l/ink-language-server.svg)](https://github.com/ephread/ink-language-server/blob/master/LICENSE.md)
[![Dependencies](https://david-dm.org/ephread/ink-language-server/status.svg)](https://david-dm.org/ephread/ink-language-server)

A language server for inkle's Ink, that adheres to the [Language Server Protocol (LSP)]. The project is in early stages.

[Language Server Protocol (LSP)]: https://microsoft.github.io/language-server-protocol/specification

## Table of contents

  * [Getting Started](#getting-started)
  	* [Installation](#installation)
  	* [Running](#running)
  	* [Configuration](#configuration)
  * [Inklecate](#inklecate)
  	* [macOS](#installation)
  	* [Linux and other platforms](#linux-and-other-platforms)
  * [License](#license)

## Getting started

The server is written in TypeScript. It is mostly intended to be run via [`ink-vscode`], but could be run with any client supporting LSP. You typically don't need to start the server yourself.

[`ink-vscode`]: https://github.com/sequitur/ink-vscode

### Installation
Install the package with [npm] or [yarn].

```shell
$ npm install ink-language-server
```

```shell
$ yarn add ink-language-server
```

[npm]: https://www.npmjs.com/
[yarn]: https://yarnpkg.com/lang/en/

### Running
If you want to run the server as-is, the entry point is located in `lib/server.js`.

```shell
$ node lib/server.js [--node-ipc|--stdio|--socket={number}]
```

### Writing a client

#### Configuration Settings
The server supports three configuration settings.

- `ink.mainStoryPath` is path to the main ink file, used by Inklecate to build the story. This setting falls back to `./main.ink`.
- `ink.inklecateExecutablePath` path to the inklecate, you would like to use if you don't want to use the bundled one. If inklecate is accessible in `$PATH`, you can just provide `inklecate`.
- `ink.runThroughMono` by default, this setting is `false`. You can force the server to use Mono by setting it to `true`.

#### Custom notifications from the server
After every successful compilation, the server will post a notification named `inkWorkspace/didCompileStory`, with the following parameters:

```typescript
export interface SaveCompiledStoryParams {
    /** Uri of the current workspace (in which the compilation happened). */
    workspaceUri: string;

    /** Uri of the compiled story, a JSON file. */
    storyUri: string;
}
```

You can take advantage of this feature to keep track of compiled stories and, for instance, provide
a preview mechanism.

The type is exposed by the package, so you can simply import it in your code:

```typescript
import { DidCompileStoryParams } from 'ink-language-server';
```

#### Exposed commands
The server expose the `compileStory` command, which can be use to trigger a full compilation. It
takes a single parameter: a URI, which will most likely be the current file in the editor.

Internally, this URI will be used to infer which workspace/story the server should compile.

## Inklecate

The server is bundled with the latest version of Inklecate, built to run natively on Windows. If you plan to use the language server on another platform, there are a few things to know.

### macOS

If the server detects that it's being intalled on macOS, it will try to download an additional native macOS binary. This optional download may fail for a wide range of reasons. If doesn't complete, you will be left with three options:

1. Download the binary archive yourself, extract it somewhere on your system and configure your language client to send its absolute path as the value of `ink.inklecateExecutablePath`.
2. Download the binary archive yourself and extract its content to `<language-server-path>/vendor/`.
3. Install a [Mono runtime], the server will then use the Windows binaries and run them through
   mono.

### Linux and other platforms

There are no prebuilt binaries for these platforms, so you will have to install the [Mono runtime] in order to run the server.

[Mono runtime]: http://www.mono-project.com/

## License

Ink Language Server is released under the MIT license. See LICENSE for details.

The Ink logo used in the header is the full property of [inkle Ltd](https://www.inklestudios.com/).
