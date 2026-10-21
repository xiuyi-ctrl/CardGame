import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const release = process.argv[2] === 'release';
const android = fileURLToPath(new URL('../android/', import.meta.url));
const windows = process.platform === 'win32';
const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java') : 'java';
const javaCheck = spawnSync(java, ['-version'], { encoding: 'utf8', timeout: 10000 });
const javaVersion = Number(`${javaCheck.stderr ?? ''}${javaCheck.stdout ?? ''}`.match(/version "(\d+)/)?.[1]);
const properties = join(android, 'local.properties');
const localSdk = existsSync(properties) ? readFileSync(properties, 'utf8').match(/^sdk\.dir=(.+)$/m)?.[1].trim().replace(/\\(.)/g, '$1') : undefined;
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || localSdk;
const errors = [];
if (!javaVersion || javaVersion < 21) errors.push('需要 JDK 21 或更高版本，请设置 JAVA_HOME；当前 Java 未通过版本检查。');
if (!sdk || !existsSync(join(sdk, 'platforms', 'android-36', 'android.jar'))) errors.push('需要 Android SDK Platform 36，请设置 ANDROID_HOME 或 android/local.properties 中的 sdk.dir。');
if (errors.length) {
  console.error(errors.join('\n'));
  console.error('安装与签名步骤见 游戏文件/Android手机适配与打包说明.md；也可使用独立 GitHub Actions 生成测试包。');
  process.exit(1);
}
if (process.argv[2] === '--check') { console.log('Android 工具链检查通过。'); process.exit(0); }
if (release && !['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'].every(key => process.env[key])) {
  console.error('正式打包需要设置 ANDROID_KEYSTORE_PATH、ANDROID_KEYSTORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD。请备份签名文件，不要提交到仓库。');
  process.exit(1);
}
const result = spawnSync(windows ? 'cmd.exe' : './gradlew', windows
  ? ['/d', '/c', 'gradlew.bat', release ? 'assembleRelease' : 'assembleDebug']
  : [release ? 'assembleRelease' : 'assembleDebug'], { cwd: android, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
