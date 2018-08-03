import DiagnosticManager from "../helpers/Class/DiagnosticManager";

import { InkWorkspace, PartialInkConfigurationSettings } from './types';

export interface IInkRunner {
  runStory(
    settings: PartialInkConfigurationSettings,
    inkWorkspace: InkWorkspace
  ): void;

  chooseOption(index: number): void;
  stopCurrentStory(): void;
}

export interface IInkCompiler {
  compileStory(
    settings: PartialInkConfigurationSettings,
    inkWorkspace: InkWorkspace
  ): void;
}