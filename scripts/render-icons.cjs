const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const resedit = require('resedit');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const svgPath = path.resolve(__dirname, '../public/favicon.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    const html = `<!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { background: transparent; overflow: hidden; width: 512px; height: 512px; display: flex; align-items: center; justify-content: center; }
          svg { width: 512px; height: 512px; }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
    </html>`;

    const win = new BrowserWindow({
      width: 512,
      height: 512,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: {
        offscreen: true
      }
    });

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 600));

    const image512 = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
    const png512 = image512.toPNG();
    fs.writeFileSync(path.resolve(__dirname, '../build/icon.png'), png512);
    console.log('Successfully saved build/icon.png (512x512):', png512.length, 'bytes');

    // Create ICO with multi-resolution icon items: 256, 128, 64, 48, 32, 24, 16
    const sizes = [256, 128, 64, 48, 32, 24, 16];
    const iconFile = new resedit.Data.IconFile();

    for (const s of sizes) {
      const resized = image512.resize({ width: s, height: s, quality: 'best' });
      const pngBuf = resized.toPNG();
      const item = resedit.Data.IconItem.from(pngBuf);
      iconFile.icons.push(item);
    }

    const icoBuf = Buffer.from(iconFile.generate());
    fs.writeFileSync(path.resolve(__dirname, '../build/icon.ico'), icoBuf);
    console.log('Successfully saved build/icon.ico:', icoBuf.length, 'bytes');

    // Also copy to dist if dist exists
    const distFavicon = path.resolve(__dirname, '../dist/favicon.svg');
    if (fs.existsSync(path.dirname(distFavicon))) {
      fs.copyFileSync(svgPath, distFavicon);
      console.log('Copied favicon.svg to dist/favicon.svg');
    }

    console.log('Icon rendering complete!');
    app.quit();
  } catch (err) {
    console.error('Error rendering icons:', err);
    process.exit(1);
  }
});
