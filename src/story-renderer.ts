// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import { IConnection } from 'vscode-languageserver';

import { RuntimeNotification } from './identifiers';

import {
  RuntimeChoice,
  RuntimeChoicesParams,
  RuntimeErrorParams,
  RuntimeTagParams,
  RuntimeTextParams,
} from './types';

export class StoryRenderer {
  private connection: IConnection;

  constructor(connection: IConnection) {
    this.connection = connection;
  }

  public showText(text: string) {
    const params: RuntimeTextParams = { text };
    this.connection.sendNotification(RuntimeNotification.text, params);
  }

  public showTag(tags: string[]) {
    const params: RuntimeTagParams = { tags };
    this.connection.sendNotification(RuntimeNotification.tag, params);
  }

  public showChoice(choice: RuntimeChoice) {
    const params: RuntimeChoicesParams = { choice };
    this.connection.sendNotification(RuntimeNotification.choice, params);
  }

  public showPrompt() {
    this.connection.sendNotification(RuntimeNotification.prompt);
  }

  public showEndOfStory() {
    this.connection.sendNotification(RuntimeNotification.endOfStory);
  }

  public reportError(error: string) {
    const params: RuntimeErrorParams = { error };
    this.connection.sendNotification(RuntimeNotification.error, params);
  }
}
