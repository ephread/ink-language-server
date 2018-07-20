// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import { spawn } from 'child_process';
import { stat } from 'fs';

// If the directory is not found, that probably means we are installed as a dependency.
// If we are installed as a dependency it may (or may not) be a good idea to check
// for vscode install script in the parent directory.
//
// Worst case scenario, the install script in run twice. If anyone has a better way to handle
// the case, I'd like to know!
const firstPath = './node_modules/vscode/bin/install';
const secondPath = '../vscode/bin/install';
stat(firstPath, (firstError, firstStatValue) => {
  if (firstStatValue) {
    const firstStat = spawn('node', [firstPath], {
      cwd: process.cwd(),
      stdio: "inherit"
    });

    firstStat.on('exit', exitProcess);
  } else {
    stat(secondPath, (secondError, secondStatValue) => {
      if (secondStatValue) {
        const secondStat = spawn('node', [secondPath], {
          cwd: process.cwd(),
          stdio: "inherit"
        });

        secondStat.on('exit', exitProcess);
      } else {
        // tslint:disable-next-line no-console
        console.log("Could no locate vscode type installer, aborting…");
        exitProcess(1);
      }
    });
  }
});

function exitProcess(code: number) {
  if (code !== 0) {
    process.exit(code);
  }
}
