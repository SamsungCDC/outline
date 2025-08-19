/* oxlint-disable no-console */
/* oxlint-disable @typescript-oxlint/no-var-requires */
/* oxlint-disable no-undef */
const { exec } = require("child_process");
const { readdirSync, existsSync, mkdirSync, copyFileSync } = require("fs");
const path = require("path");

const isWindows = process.platform === "win32";

const getDirectories = (source) =>
  readdirSync(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

/**
 * Executes a shell command and return it as a Promise.
 * @param cmd {string}
 * @return {Promise<string>}
 */
function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout ? stdout : stderr);
      }
    });
  });
}

/**
 * Cross-platform file operations
 */
function rmrfAsync(dir) {
  const cmd = isWindows
    ? `rmdir /s /q "${dir}" 2>nul || echo.`
    : `rm -rf ${dir}`;
  return execAsync(cmd);
}

function mkdirpAsync(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}

function copyFileAsync(src, dest) {
  try {
    const destDir = path.dirname(dest);
    mkdirSync(destDir, { recursive: true });
    copyFileSync(src, dest);
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}

async function build() {
  // Clean previous build
  console.log("Clean previous build…");

  await Promise.all([
    rmrfAsync("./build/server"),
    rmrfAsync("./build/plugins"),
  ]);

  const d = getDirectories("./plugins");

  // Compile server and shared
  console.log("Compiling…");
  await Promise.all([
    execAsync(
      "yarn babel --extensions .ts,.tsx --quiet -d ./build/server ./server"
    ),
    execAsync(
      "yarn babel --extensions .ts,.tsx --quiet -d ./build/shared ./shared"
    ),
    ...d.map(async (plugin) => {
      const hasServer = existsSync(`./plugins/${plugin}/server`);

      if (hasServer) {
        await execAsync(
          `yarn babel --extensions .ts,.tsx --quiet -d "./build/plugins/${plugin}/server" "./plugins/${plugin}/server"`
        );
      }

      const hasShared = existsSync(`./plugins/${plugin}/shared`);

      if (hasShared) {
        await execAsync(
          `yarn babel --extensions .ts,.tsx --quiet -d "./build/plugins/${plugin}/shared" "./plugins/${plugin}/shared"`
        );
      }
    }),
  ]);

  // Copy static files
  console.log("Copying static files…");

  // Create build directory if it doesn't exist
  mkdirSync("./build", { recursive: true });

  await Promise.all([
    copyFileAsync(
      "./server/collaboration/Procfile",
      "./build/server/collaboration/Procfile"
    ),
    copyFileAsync(
      "./server/static/error.dev.html",
      "./build/server/error.dev.html"
    ),
    copyFileAsync(
      "./server/static/error.prod.html",
      "./build/server/error.prod.html"
    ),
    copyFileAsync("./package.json", "./build/package.json"),
    ...d.map(async (plugin) => {
      const pluginJsonPath = `./plugins/${plugin}/plugin.json`;
      const destPath = `./build/plugins/${plugin}/plugin.json`;

      if (existsSync(pluginJsonPath)) {
        await copyFileAsync(pluginJsonPath, destPath);
      }
    }),
  ]);

  console.log("Done!");
}

void build();
