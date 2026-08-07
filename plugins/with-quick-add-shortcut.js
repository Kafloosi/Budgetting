/**
 * An Android launcher shortcut straight to the keypad.
 *
 * The core path is "log an expense in four seconds", and everything before the
 * keypad is friction. Long-pressing the launcher icon should skip it.
 *
 * Written as a config plugin because `android/` is gitignored — this is a managed
 * project and every build regenerates it, so an edit to the manifest by hand would
 * be wiped by the next prebuild.
 *
 * Static shortcuts live in an XML resource referenced from the main activity's
 * meta-data. `expo-router` already resolves `fare://entry` to the keypad, and
 * `scheme: "fare"` is set in app.json, so no navigation code is needed.
 */

// withStringsXml is a top-level export; only the setStringItem helper lives under
// AndroidConfig.Strings.
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require('expo/config-plugins');
const { promises: fs } = require('fs');
const path = require('path');

const SHORTCUTS_XML = `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
  <shortcut
      android:shortcutId="log-expense"
      android:enabled="true"
      android:icon="@mipmap/ic_launcher"
      android:shortcutShortLabel="@string/shortcut_log_short"
      android:shortcutLongLabel="@string/shortcut_log_long">
    <intent
        android:action="android.intent.action.VIEW"
        android:data="fare://entry"
        android:targetPackage="PACKAGE_NAME"
        android:targetClass="PACKAGE_NAME.MainActivity" />
  </shortcut>
</shortcuts>
`;

const withShortcutResource = (config) =>
  withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const packageName = modConfig.android?.package;
      if (!packageName) {
        throw new Error('with-quick-add-shortcut needs android.package to be set.');
      }

      const resDirectory = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app/src/main/res/xml',
      );
      await fs.mkdir(resDirectory, { recursive: true });
      await fs.writeFile(
        path.join(resDirectory, 'shortcuts.xml'),
        SHORTCUTS_XML.replace(/PACKAGE_NAME/g, packageName),
        'utf8',
      );

      return modConfig;
    },
  ]);

const withShortcutMetadata = (config) =>
  withAndroidManifest(config, (modConfig) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(modConfig.modResults);
    activity['meta-data'] = (activity['meta-data'] ?? []).filter(
      (entry) => entry.$['android:name'] !== 'android.app.shortcuts',
    );
    activity['meta-data'].push({
      $: {
        'android:name': 'android.app.shortcuts',
        'android:resource': '@xml/shortcuts',
      },
    });
    return modConfig;
  });

const withShortcutStrings = (config) =>
  withStringsXml(config, (modConfig) => {
    modConfig.modResults = AndroidConfig.Strings.setStringItem(
      [
        { $: { name: 'shortcut_log_short', translatable: 'false' }, _: 'Log' },
        { $: { name: 'shortcut_log_long', translatable: 'false' }, _: 'Log an expense' },
      ],
      modConfig.modResults,
    );
    return modConfig;
  });

module.exports = (config) =>
  withShortcutStrings(withShortcutMetadata(withShortcutResource(config)));
