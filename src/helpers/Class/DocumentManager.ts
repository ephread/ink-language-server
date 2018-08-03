// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import { TextDocuments } from "vscode-languageserver";

import {
  PartialInkConfigurationSettings
} from "../../types/types";

/**
 * Manages and mirrors the documents opened by the client.
 */
export default class DocumentManager {
  /** Documents managed by the clients. */
  public documents: TextDocuments = new TextDocuments();

  /**
   * Document settings, scoped per document, returned by the client.
   *
   * URIs of the client's `TextDocument` will be used as keys.
   */
  public documentSettings: Map<string, Thenable<PartialInkConfigurationSettings>> = new Map();
}
