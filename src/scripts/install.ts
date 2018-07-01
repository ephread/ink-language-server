// Copyright (c) Frédéric Maquin <fred@ephread.com>
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

import * as Progress from "cli-progress";
import * as Extract from "extract-zip";
import * as Fs from "fs";
import * as Path from "path";
import * as Request from "request";

const INK_VERSION = '0.8.1';

/** Global progress used during archive download. */
let progress: Progress.Bar;

/** Messages displayed to the user. */
const messages = {
  unsupportedPlatform:
    "You are running a platform for which there are no prebuilt binaries. " +
    "The server comes bundled with an inklecate requiring the Mono runtime to run. " +
    "For more information, please read " +
    "https://github.com/ephread/ink-language-server/blob/master/README.md#inklecate",

  installError:
    "Inklecate could not be installed automatically. " +
    "For alternative options please read: " +
    "https://github.com/ephread/ink-language-server/blob/master/README.md#inklecate"
}

/**
 * Log the given message.
 * 
 * @param message message to log.
 */
function log(message: any) {
  // tslint:disable-next-line no-console
  console.log(message);
}

/**
 * Returns the name of the archive to download, depending on the architecture.
 */
function optionalMacOsBundleName(): string | undefined {
  const arch = process.arch;
  if (arch === "ia32" || arch === "x86") {
    return `inklecate_${INK_VERSION}-macos_i386.zip`;
  }
  if (arch === "x64") {
    return `inklecate_${INK_VERSION}-macos_x64.zip`;
  }
}

/**
 * Returns `true` if the script is running on MacOS.
 */
function isRunningOnMac(): boolean {
  return process.platform === "darwin";
}

/**
 * Returns `true` if the script is running on Windows.
 */
function isRunningOnWindows(): boolean {
  return process.platform === "win32";
}

/**
 * Returns `true` if the given HTTP response is Ok.
 */
function isResponseOk(response: Request.Response) {
  return response.statusCode >= 200 && response.statusCode < 300;
}

/**
 * 
 * 
 * @param error 
 * @param callback 
 */
function handleError(error: Error | string, callback: (error: Error | string) => void) {
  let message = "Cannot download inklecate. Reason: ";

  if (typeof error === "string") {
    message += error;
  } else {
    message += error.message;
  }

  callback(message);
}

/**
 * Download the prebuilt binary from the given `url`, and store it at the given `destinationPath`.
 * 
 * @param url URL of the prebuilt binary.
 * @param destinationPath path at which store the binary.
 * @param callback callback called upon completion of the download or when an error is encountered.
 */
function downloadDependency(
  url: string,
  destinationPath: string,
  callback: (error: Error | string) => void
) {
  const request = Request(url).on("response", response => {
    if (!isResponseOk(response)) {
      handleError(`HTTP error ${response.statusCode} ${response.statusMessage}`, callback);
    } else {
      request
        .pipe(Fs.createWriteStream(destinationPath).on("error", callback))
        .on("finish", callback);

      if (process.env.npm_config_progress === "true") {
        const length = parseInt(response.headers["content-length"] as string, 10);
        progress = new Progress.Bar({}, Progress.Presets.legacy);
        progress.start(length, 0);

        response
          .on("data", chunk => {
            progress.increment(chunk.length);
          })
          .on("end", () => {
            progress.stop();
          });
      }
    }
  });
}

/**
 * 
 */
function checkPlatformAndDownloadBinaryDependency() {
  if (isRunningOnMac()) {
    // Running on a mac.
    const bundleName = optionalMacOsBundleName();
    const urlpart = `https://dl.bintray.com/ephread/ink-language-server/`;
  
    if (bundleName) {
      const url = `${urlpart}${bundleName}`;
      const vendorDir = Path.join(__dirname, "../../vendor/");
      const filePath = Path.join(vendorDir, bundleName);
  
      Fs.stat('./vendor/inklecate', (statError, stat) => {
        if (stat) {
          log(`Running on macOS, inklecate has already been downloaded.`);
        } else {
          log(`Running on macOS, fetching inkeclate from: ${url}`);
  
          downloadDependency(url, filePath, error => {
            if (error) {
              if (progress) {
                progress.stop();
              }
              log(error);
              log(messages.installError);
            } else {
              Extract(filePath, { dir: vendorDir }, extractError => {
                if (extractError) {
                  log(extractError.message);
                } else {
                  Fs.unlink(filePath, unLinkError => {
                    if (unLinkError) {
                      log(unLinkError);
                    }
                  });
                  log("Inklecate successfully installed!");
                }
              });
            }
          });
        }
      })
    }
  } else if (!isRunningOnWindows()) {
    log(messages.unsupportedPlatform);
  }
}

checkPlatformAndDownloadBinaryDependency();
