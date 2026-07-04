const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function parseTimes(value) {
  if (!value) return [];
  return value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item));
}

async function main() {
  const videoPath = argValue("--video");
  const outDir = argValue("--out", path.join(process.cwd(), "tmp", "electron-video-frames"));
  const times = parseTimes(argValue("--times", ""));
  if (!videoPath) throw new Error("Missing --video path");
  fs.mkdirSync(outDir, { recursive: true });

  const videoUrl = pathToFileURL(path.resolve(videoPath)).href;
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          html, body { margin: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
          video { width: 100vw; height: 100vh; object-fit: contain; background: #000; }
        </style>
      </head>
      <body>
        <video id="v" muted preload="auto" src="${videoUrl}"></video>
      </body>
    </html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const v = document.getElementById("v");
      if (!v) reject(new Error("video element missing"));
      if (Number.isFinite(v.duration) && v.duration > 0) resolve();
      else {
        v.addEventListener("loadedmetadata", resolve, { once: true });
        v.addEventListener("error", () => reject(new Error("video failed to load")), { once: true });
      }
    })
  `);
  const meta = await win.webContents.executeJavaScript(`(() => {
    const v = document.getElementById("v");
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  })()`);
  const captureTimes = times.length ? times : Array.from({ length: Math.floor(meta.duration) + 1 }, (_, index) => index);
  const frames = [];
  for (const rawTime of captureTimes) {
    const time = Math.max(0, Math.min(Number(rawTime), Math.max(0, meta.duration - 0.05)));
    await win.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const v = document.getElementById("v");
        const done = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
        const fail = () => reject(new Error("seek failed"));
        v.pause();
        v.addEventListener("seeked", done, { once: true });
        v.addEventListener("error", fail, { once: true });
        v.currentTime = ${JSON.stringify(time)};
      })
    `);
    const image = await win.webContents.capturePage();
    const file = path.join(outDir, `frame_${String(Math.round(time * 1000)).padStart(5, "0")}ms.png`);
    fs.writeFileSync(file, image.toPNG());
    frames.push({ time, file });
  }
  console.log(JSON.stringify({ meta, frames }, null, 2));
  await win.close();
}

app.whenReady()
  .then(main)
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => app.quit());
