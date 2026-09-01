/**
 * Ad-hoc signing on macOS.
 *
 * There is no Apple certificate (a cost decision), but an Apple Silicon binary
 * **needs** some signature to launch at all — without one the system kills the
 * process. `codesign --sign -` is the local signature that satisfies that; the
 * "unidentified developer" warning remains, and the download page explains how
 * to get past it.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }
  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
