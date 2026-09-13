const { withAppBuildGradle } = require("expo/config-plugins");

const RELEASE_SIGNING_CONFIG = `        release {
            def releaseKeystorePath = System.getenv("COMEPLAYERS_ANDROID_KEYSTORE_PATH")
            if (releaseKeystorePath) {
                storeFile file(releaseKeystorePath)
                storePassword System.getenv("COMEPLAYERS_ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("COMEPLAYERS_ANDROID_KEY_ALIAS")
                keyPassword System.getenv("COMEPLAYERS_ANDROID_KEY_PASSWORD")
            }
        }
`;

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== "groovy") return gradleConfig;

    let contents = gradleConfig.modResults.contents;
    if (!contents.includes("COMEPLAYERS_ANDROID_KEYSTORE_PATH")) {
      contents = contents.replace(
        "        }\n    }\n    buildTypes {",
        `        }
${RELEASE_SIGNING_CONFIG}    }
    buildTypes {`
      );
      contents = contents.replace(
        "            signingConfig signingConfigs.debug\n            def enableShrinkResources",
        `            signingConfig System.getenv("COMEPLAYERS_ANDROID_KEYSTORE_PATH")
                ? signingConfigs.release
                : signingConfigs.debug
            def enableShrinkResources`
      );
    }

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
};
