# BillNova India

**Scan. Add. Bill.** Instant, offline-first billing for every Indian business.

BillNova India is a installable Progressive Web App (PWA) that turns any phone or tablet into a point-of-sale billing counter — scan a product's barcode or QR code, watch it land in the cart, and generate a professional GST-ready receipt in seconds. No server, no sign-up, no internet required after the first load.

> 📸 **Screenshots**
>
> | Billing (Live Scanner) | Cart & Checkout | Receipt |
> |---|---|---|
> | _add screenshot: `docs/screenshots/billing.png`_ | _add screenshot: `docs/screenshots/cart.png`_ | _add screenshot: `docs/screenshots/receipt.png`_ |
>
> | Recent Bills | Profile | Install Prompt |
> |---|---|---|
> | _add screenshot: `docs/screenshots/recent.png`_ | _add screenshot: `docs/screenshots/profile.png`_ | _add screenshot: `docs/screenshots/install.png`_ |

---

## Features

- **Live scanner, always on** — the camera opens the moment you land on the Billing screen. No "tap to scan" button, no loading spinner in the way.
- **QR + Barcode modes** — one tap switches between a square QR frame and a wide barcode frame, with the underlying decoder reconfigured (EAN-13/8, UPC-A/E, CODE-128/39, Codabar, ITF, and QR).
- **Adaptive scan frame** — the on-screen guide reshapes itself to match whichever code format you're scanning.
- **Front/rear camera switch & flashlight** — for dim stockrooms or front-facing checkouts.
- **Know a code, skip the form** — the first time you scan a new barcode/QR you enter its name and price once; every scan after that adds it to the cart instantly, pulled from your local product database.
- **Manual add** — a floating "+" button for items without a printed code.
- **Cart with GST, discounts & notes** — per-bill discount %, GST %, and free-text notes, with live-updating totals.
- **Cash or UPI checkout** — UPI payments generate a scannable QR pre-filled with your UPI ID and the exact amount due, plus a one-tap "copy UPI ID" button.
- **Professional receipts** — a clean, thermal-style receipt for every bill, exportable as a **PDF**, sent straight to a **printer**, or **shared on WhatsApp**.
- **Recent Bills** — every completed bill is saved locally; search, filter by date, reopen, duplicate into a new cart, or delete.
- **Shop Profile** — set your shop name, contact number, UPI ID, footer message, and currency symbol once; it's used on every receipt from then on.
- **Installable PWA** — add it to your home screen on Android, iOS, or desktop like a native app.
- **Fully offline-first** — a service worker pre-caches the entire app shell (HTML, CSS, JS, icons, fonts, and vendor libraries), so it keeps working with no signal at all. Your product catalog and bill history live in IndexedDB / localStorage on the device — nothing leaves your phone.
- **Light & dark themes** — respects your system preference, with a manual override.

---

## Tech Stack

| Layer | Choice |
|---|---|
| UI | Vanilla HTML5, CSS3 (no framework, no build step) |
| Logic | Vanilla ES6+ JavaScript, one small module per concern (`js/*.js`) |
| Storage | IndexedDB (product catalog + saved bills) and localStorage (cart-in-progress + profile settings) |
| Scanning | [html5-qrcode](https://github.com/mebjas/html5-qrcode) |
| Barcode rendering (UPI/product codes) | [JsBarcode](https://github.com/lindell/JsBarcode) |
| QR rendering (UPI payment QR) | [qrcode.js](https://github.com/davidshimjs/qrcodejs) |
| PDF export | [jsPDF](https://github.com/parallax/jsPDF) + [html2canvas](https://github.com/niklasvh/html2canvas) |
| Icons | [Font Awesome](https://fontawesome.com/) (bundled locally, self-hosted) |
| Offline support | Native Service Worker API + Web App Manifest |

All third-party libraries are vendored locally under `vendor/` — the only external network request the app ever makes is for the Google Fonts stylesheet (Inter), and even that is cached by the service worker after the first successful load and never blocks the app if it fails.

---

## Project Structure

```
BillNova-India/
├── index.html                  # Single-page app shell; all screens live here
├── manifest.json                # PWA manifest (name, icons, theme, display mode)
├── service-worker.js            # Offline cache-first strategy + app shell pre-cache
│
├── css/
│   ├── variables.css            # Design tokens: colors, spacing, radii, shadows
│   ├── base.css                 # Resets, typography, global element styles
│   ├── components.css           # Buttons, inputs, badges, empty states, modals
│   ├── layout.css                # App shell layout, header, page containers
│   ├── bottom-nav.css            # Bottom navigation bar
│   ├── scanner.css              # Live scanner viewport, overlay, scan frame
│   ├── cart.css                  # Cart list, item rows, totals panel
│   ├── billing-flow.css          # Checkout flow: payment tabs, UPI QR, success state
│   ├── receipt.css              # Printable/exportable receipt layout
│   ├── recent.css                # Recent Bills list, search & filter toolbar
│   ├── profile.css               # Profile / settings screen
│   └── themes.css                # Light & dark theme variable overrides
│
├── js/
│   ├── db.js                     # IndexedDB layer: products + saved bills
│   ├── utils.js                  # Shared helpers (currency format, id gen, vibrate, beep…)
│   ├── toast.js                   # Toast notification system
│   ├── loading.js                 # Loading overlay helper
│   ├── modal.js                    # Generic modal open/close + confirm dialog
│   ├── onboarding.js               # First-run onboarding overlay
│   ├── pwa-install.js              # "Install app" button + beforeinstallprompt handling
│   ├── scanner.js                  # Live camera scanner (QR/barcode modes, torch, switch)
│   ├── cart.js                      # Cart state, totals, discount/GST/notes, persistence
│   ├── profile.js                   # Shop profile get/update/load + localStorage persistence
│   ├── receipt.js                   # Receipt rendering, PDF export, print, WhatsApp share
│   ├── billing.js                    # Checkout flow: confirm → payment → success → actions
│   ├── recent.js                     # Recent Bills list, search, filter, duplicate, delete
│   ├── navigation.js                  # Bottom-nav page switching + scanner start/stop
│   └── app.js                          # Bootstraps every module in the correct order
│
├── assets/icons/                # App icons in every size the manifest/iOS/Android need
└── vendor/                        # Self-hosted third-party libraries (see Tech Stack)
```

---

## Getting Started

BillNova India is a static site — there is no build step, no `npm install`, and no server-side code. Any static file host works.

### Run it locally

Because service workers require a proper origin (not `file://`), serve the folder with any local static server, for example:

```bash
# Python 3
python3 -m http.server 8080

# Node (if you have it)
npx serve .
```

Then open `http://localhost:8080` in your browser.

### Deploy to GitHub Pages

1. Push this project to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
4. Choose the branch (e.g. `main`) and the root folder (`/`), then **Save**.
5. GitHub will publish the site at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

All paths in `index.html`, `manifest.json`, and `service-worker.js` are relative (`./...`), so the app works correctly whether it's hosted at a domain root or inside a GitHub Pages project subpath — no path rewriting needed.

---

## Installing as an App (PWA)

**Android (Chrome):** open the site, tap the install icon in the address bar or the in-app install button (appears automatically once the browser reports the app is installable), then **Install**.

**iOS (Safari):** open the site, tap the **Share** icon, then **Add to Home Screen**.

**Desktop (Chrome/Edge):** open the site, click the install icon in the address bar, or use the in-app install button in the header.

Once installed, BillNova India launches full-screen like a native app, with its own icon and no browser chrome.

---

## Offline Support

On first load, the service worker pre-caches the entire app shell — every HTML, CSS, and JS file, all icons, and every vendor library. After that:

- The app **boots and fully functions with no network connection at all**, including the live scanner, cart, checkout, and receipt generation/printing.
- Your **product catalog** (code → name/price) and **bill history** are stored on-device in IndexedDB.
- Your **cart-in-progress** and **shop profile** are stored on-device in localStorage.
- None of this data is ever sent to a server — there isn't one.
- New app versions are picked up automatically: the service worker caches under a versioned key and clears out old caches on activation.

The only thing that ever touches the network is the Google Fonts stylesheet, which is fetched opportunistically and cached for next time; if it's unavailable (e.g. offline on first visit), the app falls back to system fonts and continues working normally.

---

## Usage Guide

1. **Set up your shop profile** (Profile tab) — shop name, contact number, UPI ID, footer message, and currency symbol. This appears on every receipt and UPI QR you generate.
2. **Start billing** (Billing tab, default screen) — the camera opens automatically.
   - Point it at a barcode or QR code. On first scan of an unknown code, you'll be asked to name it and set a price once; it's remembered for every future scan.
   - Use the mode toggle to switch between QR and Barcode scanning, and the flashlight/camera-switch buttons as needed.
   - No code to scan? Tap the **+** button to add an item manually.
3. **Review the cart** — adjust quantities, add a discount %, GST %, or a note, and check the live total.
4. **Checkout** — choose **Cash** or **UPI**. For UPI, a payment QR is generated instantly with the exact amount; the customer scans and pays, or you copy the UPI ID directly.
5. **Get the receipt** — after a successful checkout, export the receipt as a **PDF**, send it to a **printer**, or **share it on WhatsApp**.
6. **Browse Recent Bills** — search or filter by date, reopen any past bill, duplicate it into a fresh cart, or delete it.

---

## Browser Support

BillNova India targets modern evergreen browsers with PWA and camera support: Chrome, Edge, and Firefox on desktop/Android, and Safari on iOS/iPadOS 16.4+. Camera access requires a secure context (`https://` or `localhost`).

---

## License

This project is provided as-is for the commissioning user. Bundled third-party libraries (html5-qrcode, JsBarcode, qrcode.js, jsPDF, html2canvas, Font Awesome) retain their own respective licenses — see each library's project page for details.
