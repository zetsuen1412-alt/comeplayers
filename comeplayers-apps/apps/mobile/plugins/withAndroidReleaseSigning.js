const fs = require("node:fs");
const path = require("node:path");
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// ComePlayers original release signing guard";
const signingGuard = fs.readFileSync(path.join(__dirname, "original-release-signing.gradle"), "utf8").replace(/\r\n/g, "\n").trim();

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== "groovy") {
      throw new Error("ComePlayers release signing requires the reviewed Groovy Gradle configuration.");
    }
    const contents = gradleConfig.modResults.contents.replace(/\r\n/g, "\n");
    if (contents.includes(MARKER)) {
      if (!contents.includes(signingGuard)) {
        throw new Error("ComePlayers signing guard changed. Regenerate the native project before building.");
      }
      return gradleConfig;
    }
    // Append an explicit override instead of matching indentation in Expo's
    // template. EAS may populate this same release config after prebuild.
    gradleConfig.modResults.contents = `${contents.trimEnd()}\n\n${signingGuard}\n`;
    return gradleConfig;
  });
};
