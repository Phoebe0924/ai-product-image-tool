/**
 * Canvas synthesis for LightPic — Template 1 v2: "Split 45/55"
 *
 * Layout (matches user's reference image #4 + user-chosen 45/55 split):
 *
 *   ┌─────────────────────────┬────────────────────────────────┐ 750×750
 *   │ MAIN TITLE              │                                │
 *   │ (two lines, bold)       │                                │
 *   │ SUB TITLE               │                                │
 *   │                         │                                │
 *   │ ✓ bullet                │      [PRODUCT HERO]            │
 *   │ ✓ bullet                │      (fitted contain)          │
 *   │ ✓ bullet                │                                │
 *   │                         │                       ┌──────┐ │
 *   │   ┌─────┐               │                       │麦穗 1│ │
 *   │   │ NEW │               │                       └──────┘ │
 *   │   └─────┘               │                                │
 *   │                         │                       ┌──────┐ │
 *   │                         │                       │麦穗 2│ │
 *   │ brand                   │                       └──────┘ │
 *   └─────────────────────────┴────────────────────────────────┘
 *           45% (0-337px)              55% (337-750px)
 *
 * Background strategy: sample the dominant color from the left edge of
 * the base image and fill the left 45% with it (with a soft vertical
 * gradient), creating the illusion that the scene extends leftward.
 * The right 55% shows the actual base image fitted with the same
 * sampled color as padding. Result: a single continuous "extended
 * scene" with text floating on the left side, no harsh column divider.
 *
 * Fonts: self-hosted Noto Sans SC via next/font, read from CSS var.
 */

export type CopyData = {
  main_title: string;
  sub_title: string;
  bullets: string[];
  side_badges: string[];
  new_badge: string;
  brand: string;
};

const CANVAS_SIZE = 750;
const LEFT_W = Math.round(CANVAS_SIZE * 0.45); // 337
const RIGHT_X = LEFT_W;
const RIGHT_W = CANVAS_SIZE - LEFT_W;          // 413
const LEFT_PAD = 32;

function getFontFamily(): string {
  if (typeof document === "undefined") {
    return '"PingFang SC", "Heiti SC", "Microsoft YaHei", sans-serif';
  }
  const cssVar = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-noto-sans-sc")
    .trim();
  if (cssVar) {
    return `${cssVar}, "PingFang SC", "Heiti SC", "Microsoft YaHei", sans-serif`;
  }
  return '"Noto Sans SC", "PingFang SC", "Heiti SC", "Microsoft YaHei", sans-serif';
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Sample the dominant color along the left edge of the image.
 * We render a 1×N strip to an offscreen canvas and average the pixels.
 * Returns CSS rgb() string and the average lightness 0..1.
 */
function sampleLeftEdge(img: HTMLImageElement): {
  rgb: string;
  topRgb: string;
  bottomRgb: string;
  isDark: boolean;
} {
  const strip = document.createElement("canvas");
  strip.width = 1;
  strip.height = 32;
  const sctx = strip.getContext("2d", { willReadFrequently: true });
  if (!sctx) {
    return {
      rgb: "rgb(245,245,247)",
      topRgb: "rgb(245,245,247)",
      bottomRgb: "rgb(235,235,237)",
      isDark: false,
    };
  }
  // Draw the leftmost ~5% column of the source image, scaled into 1×32
  const sw = Math.max(2, Math.floor(img.width * 0.05));
  sctx.drawImage(img, 0, 0, sw, img.height, 0, 0, 1, 32);
  const data = sctx.getImageData(0, 0, 1, 32).data;
  let sumR = 0, sumG = 0, sumB = 0;
  let topR = 0, topG = 0, topB = 0;
  let botR = 0, botG = 0, botB = 0;
  for (let y = 0; y < 32; y++) {
    const r = data[y * 4];
    const g = data[y * 4 + 1];
    const b = data[y * 4 + 2];
    sumR += r; sumG += g; sumB += b;
    if (y < 10) { topR += r; topG += g; topB += b; }
    if (y >= 22) { botR += r; botG += g; botB += b; }
  }
  const avgR = Math.round(sumR / 32);
  const avgG = Math.round(sumG / 32);
  const avgB = Math.round(sumB / 32);
  const tR = Math.round(topR / 10);
  const tG = Math.round(topG / 10);
  const tB = Math.round(topB / 10);
  const bR = Math.round(botR / 10);
  const bG = Math.round(botG / 10);
  const bB = Math.round(botB / 10);
  // perceived luminance (Rec. 709)
  const luma = (0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB) / 255;
  return {
    rgb: `rgb(${avgR},${avgG},${avgB})`,
    topRgb: `rgb(${tR},${tG},${tB})`,
    bottomRgb: `rgb(${bR},${bG},${bB})`,
    isDark: luma < 0.45,
  };
}

/** Draw image into target rect using object-fit: contain, fill rest with padColor. */
function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  padColor: string,
) {
  ctx.fillStyle = padColor;
  ctx.fillRect(x, y, w, h);
  const r = Math.min(w / img.width, h / img.height);
  const dw = img.width * r;
  const dh = img.height * r;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Auto line-break a long Chinese title into up to two lines. */
function breakTitle(text: string, maxChars: number): [string, string] {
  if (text.length <= maxChars) return [text, ""];
  const spaceIdx = text.indexOf(" ", Math.floor(text.length / 2) - 2);
  const splitAt = spaceIdx > 0 ? spaceIdx : Math.ceil(text.length / 2);
  return [text.slice(0, splitAt).trim(), text.slice(splitAt).trim()];
}

/** Draw text with a soft halo (used when overlaying on photographic scene). */
function fillWithHalo(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  haloColor: string,
) {
  ctx.shadowColor = haloColor;
  ctx.shadowBlur = 6;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function drawLeftPanel(
  ctx: CanvasRenderingContext2D,
  copy: CopyData,
  fontFamily: string,
  textColor: string,
  haloColor: string,
) {
  ctx.textAlign = "left";
  let y = 48;

  // Main title (2 lines, very bold)
  const [line1, line2] = breakTitle(copy.main_title, 8);
  ctx.fillStyle = textColor;
  ctx.textBaseline = "top";
  ctx.font = `900 44px ${fontFamily}`;
  fillWithHalo(ctx, line1, LEFT_PAD, y, haloColor);
  if (line2) {
    y += 54;
    fillWithHalo(ctx, line2, LEFT_PAD, y, haloColor);
  }
  y += 64;

  // Sub title
  if (copy.sub_title) {
    ctx.font = `700 22px ${fontFamily}`;
    fillWithHalo(ctx, copy.sub_title, LEFT_PAD, y, haloColor);
    y += 44;
  } else {
    y += 12;
  }

  // 3 ✓ bullets
  y += 8;
  ctx.font = `500 18px ${fontFamily}`;
  ctx.textBaseline = "middle";
  for (const b of (copy.bullets ?? []).slice(0, 3)) {
    // checkmark
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = haloColor;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(LEFT_PAD, y);
    ctx.lineTo(LEFT_PAD + 6, y + 6);
    ctx.lineTo(LEFT_PAD + 16, y - 6);
    ctx.stroke();
    ctx.shadowBlur = 0;
    fillWithHalo(ctx, b, LEFT_PAD + 26, y + 1, haloColor);
    y += 36;
  }

  // NEW circular badge (sunburst) — placed mid-left
  if (copy.new_badge && copy.new_badge.trim()) {
    const cx = LEFT_PAD + 56;
    const cy = CANVAS_SIZE * 0.66;
    const r = 50;
    // outer ring
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#E5C97A";
    ctx.lineWidth = 2;
    ctx.stroke();
    // sunburst
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4));
      ctx.lineTo(cx + Math.cos(a) * (r + 12), cy + Math.sin(a) * (r + 12));
      ctx.stroke();
    }
    // text
    const parts = copy.new_badge.split(/[\s·]+/).filter(Boolean);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1A1A1A";
    if (parts.length >= 2 && /^[A-Za-z]+$/.test(parts[0])) {
      ctx.font = `900 20px ${fontFamily}`;
      ctx.fillText(parts[0].toUpperCase(), cx, cy - 10);
      ctx.font = `600 13px ${fontFamily}`;
      ctx.fillText(parts.slice(1).join(""), cx, cy + 12);
    } else {
      ctx.font = `700 15px ${fontFamily}`;
      ctx.fillText(copy.new_badge.slice(0, 6), cx, cy);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
  }

  // Brand at bottom-left
  if (copy.brand && copy.brand.trim()) {
    ctx.fillStyle = textColor;
    ctx.font = `800 18px ${fontFamily}`;
    ctx.textBaseline = "alphabetic";
    fillWithHalo(ctx, copy.brand, LEFT_PAD, CANVAS_SIZE - 32, haloColor);
  }
}

/** Right-side wheat-spike pill badges, floating next to the product. */
function drawSideBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  fontFamily: string,
) {
  if (!text || !text.trim()) return;
  ctx.font = `600 16px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width;
  const padX = 12;
  const w = tw + padX * 2;
  const h = 32;
  const r = h / 2;
  // pill bg
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + r, cy - h / 2);
  ctx.arcTo(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r);
  ctx.arcTo(cx + w / 2, cy + h / 2, cx - w / 2, cy + h / 2, r);
  ctx.arcTo(cx - w / 2, cy + h / 2, cx - w / 2, cy - h / 2, r);
  ctx.arcTo(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, r);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#E5C97A";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // wheat strokes
  ctx.strokeStyle = "#C9A95C";
  ctx.lineWidth = 1.2;
  for (const dir of [-1, 1]) {
    const baseX = cx + dir * (w / 2 + 4);
    for (let i = 0; i < 3; i++) {
      const yy = cy - 6 + i * 6;
      ctx.beginPath();
      ctx.moveTo(baseX, yy);
      ctx.lineTo(baseX + dir * 8, yy - 2);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#1A1A1A";
  ctx.fillText(text, cx, cy + 1);
}

async function waitForFonts(fontFamily: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const primary = fontFamily.split(",")[0].trim();
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`900 44px ${primary}`),
        document.fonts.load(`700 22px ${primary}`),
        document.fonts.load(`500 18px ${primary}`),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    await Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 500)),
    ]);
  } catch {
    // Best-effort.
  }
}

/**
 * Compose a 750×750 split-layout marketing image.
 * Returns a PNG dataURL.
 */
export async function synthesizeTemplate1(
  baseImageUrl: string,
  copy: CopyData,
): Promise<string> {
  const fontFamily = getFontFamily();
  await waitForFonts(fontFamily);
  const img = await loadImage(baseImageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");

  // 1. Sample left-edge colors from the base image
  const sampled = sampleLeftEdge(img);

  // 2. Fill left 45% with a soft vertical gradient sampled from base
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_SIZE);
  grad.addColorStop(0, sampled.topRgb);
  grad.addColorStop(1, sampled.bottomRgb);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, LEFT_W, CANVAS_SIZE);

  // 3. Draw base image fitted into right 55%, padded with sampled color
  drawContain(ctx, img, RIGHT_X, 0, RIGHT_W, CANVAS_SIZE, sampled.rgb);

  // 4. Pick text + halo colors based on left-panel luminance
  const textColor = sampled.isDark ? "#FFFFFF" : "#1A1A1A";
  const haloColor = sampled.isDark
    ? "rgba(0,0,0,0.45)"
    : "rgba(255,255,255,0.55)";

  // 5. Render left text panel
  drawLeftPanel(ctx, copy, fontFamily, textColor, haloColor);

  // 6. Render right-side badges floating next to the product
  const sideBadges = (copy.side_badges ?? []).slice(0, 2);
  const badgeX = CANVAS_SIZE - 80; // anchored to right margin
  if (sideBadges[0]) drawSideBadge(ctx, sideBadges[0], badgeX, CANVAS_SIZE * 0.42, fontFamily);
  if (sideBadges[1]) drawSideBadge(ctx, sideBadges[1], badgeX, CANVAS_SIZE * 0.56, fontFamily);

  return canvas.toDataURL("image/png", 0.95);
}
