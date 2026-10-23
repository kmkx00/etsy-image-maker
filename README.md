# Etsy image maker

Open `index.html` in a browser. Choose 13 original PNGs, confirm which file is
the bonus pattern, then generate the eight listing images. Exports are
3000 × 3000 JPEGs, individually or in a ZIP. The 12 clipart elements and bonus
pattern are identified separately. Source PNG files are never overwritten.

Controls lock during file processing and generation. Each generation uses a
snapshot of the settings and only publishes a complete set. Artwork bounds are
measured from all nonzero alpha pixels at original resolution; padded, resized
working copies are used for listing images, not customer artwork delivery.

## Verification

Requires Node.js 20 or later.

```sh
npm install
npm test
```

The canvas regression checks use actual raster rendering with a DOM test
double. They exercise faint-alpha bounds, control locking, settings snapshots,
all eight export dimensions, error recovery, bonus selection and file-count
validation. A rendered contact sheet and ZIP are written to the system temp
directory for visual review and independent extraction checks.

For browser verification:

```sh
npx playwright install chromium
npm run test:browser
```

With WebKit installed, `BROWSER=webkit npm run test:browser` uses that engine.
Browser automation does not replace a real iPhone test of the native Share
sheet and Safari downloads. On iPhone, verify both **Save Selected Image** and
**Save All 8 Images (ZIP)**, then confirm the ZIP opens to eight images in Files.
