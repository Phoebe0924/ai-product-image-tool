/**
 * Canvas synthesis for LightPic — multi-layout Pinduoduo CTR style
 *
 * Layout variants (assigned by scene id):
 *
 * A — 大居中偏左 + 顶部强痛点 + 无底条
 *   ┌──────────────────────────────┐
 *   │ MAIN TITLE (top, huge)       │
 *   │                              │
 *   │   [PRODUCT large, center-L]  │
 *   │                    sub_title │
 *   └──────────────────────────────┘
 *
 * B — 产品偏右 + 左侧痛点信息
 *   ┌──────────────────────────────┐
 *   │ MAIN TITLE (left, large)     │
 *   │ ✓ bullet 1                   │
 *   │ ✓ bullet 2   [PRODUCT right] │
 *   │ sub_title                    │
 *   └──────────────────────────────┘
 *
 * C — 产品近景/局部 + 底部小字说明
 *   ┌──────────────────────────────┐
 *   │                              │
 *   │   [PRODUCT full-bleed]       │
 *   │                              │
 *   │ MAIN TITLE  sub_title        │
 *   └──────────────────────────────┘
 *
 * D — 产品居中大图 + 顶部人群定向 + 底条
 *   ┌──────────────────────────────┐
 *   │ brand / 人群定向 (top-right) │
 *   │   [PRODUCT center, large]    │
 *   │                   ✓ bullet 1 │
 *   │                   ✓ bullet 2 │
 *   ├──────────────────────────────┤
 *   │ sub_title (bottom banner)    │
 *   └──────────────────────────────┘
 */

export type CopyData = {
  main_title: string;
  sub_title: string;
  bullets: string[];
  side_badges: string[];
  new_badge: string;
  brand: string;
};

const S = 750;
const PAD = 32;

function getFontFamily(): string {
  if (typeof document === "undefined") {
    return '"PingFang SC", "Heiti SC", "Microsoft YaHei", sans-serif';
  }
  const cssVar = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-noto-sans-sc")
    .trim();
  if (cssVar) return `${cssVar}, "PingFang SC", "Heiti SC", "Microsoft YaHei", sans-serif`;
  return '"PingFang SC", "Heiti SC", "Microsoft YaHei", sans-serif';
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

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
) {
  const r = Math.max(w / img.width, h / img.height);
  const dw = img.width * r;
  const dh = img.height * r;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function splitTitle(text: string): [string, string] {
  if (text.length <= 6) return [text, ""];
  const mid = Math.floor(text.length / 2);
  for (let d = 0; d <= mid; d++) {
    if (text[mid - d] === " ") return [text.slice(0, mid - d).trim(), text.slice(mid - d).trim()];
    if (text[mid + d] === " ") return [text.slice(0, mid + d).trim(), text.slice(mid + d).trim()];
  }
  return [text.slice(0, mid), text.slice(mid)];
}

async function waitForFonts(fontFamily: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const primary = fontFamily.split(",")[0].trim();
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`900 120px ${primary}`),
        document.fonts.load(`700 24px ${primary}`),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 500))]);
  } catch { /* best-effort */ }
}

function drawBullets(
  ctx: CanvasRenderingContext2D,
  bullets: string[],
  fontFamily: string,
  anchorX: number,
  anchorY: number,
  align: "left" | "right",
) {
  const fontSize = 22;
  const pillH = 36;
  const pillGap = 10;
  const pillPadX = 12;
  const ckW = 24;
  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "middle";

  bullets.slice(0, 2).forEach((b, i) => {
    const tw = ctx.measureText(b).width;
    const pillW = Math.min(ckW + tw + pillPadX * 2, 260);
    const px = align === "right" ? anchorX - pillW : anchorX;
    const py = anchorY + i * (pillH + pillGap);
    const cy = py + pillH / 2;

    ctx.fillStyle = "rgba(0,0,0,0.50)";
    ctx.beginPath();
    const r = pillH / 2;
    ctx.moveTo(px + r, py);
    ctx.arcTo(px + pillW, py, px + pillW, py + pillH, r);
    ctx.arcTo(px + pillW, py + pillH, px, py + pillH, r);
    ctx.arcTo(px, py + pillH, px, py, r);
    ctx.arcTo(px, py, px + pillW, py, r);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const ckX = px + pillPadX;
    ctx.beginPath();
    ctx.moveTo(ckX, cy);
    ctx.lineTo(ckX + 5, cy + 5);
    ctx.lineTo(ckX + 14, cy - 5);
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 2;
    ctx.fillText(b, px + ckW + pillPadX, cy + 1);
    ctx.shadowBlur = 0;
  });
}

// ── Layout A: 大居中偏左 + 顶部强痛点 + 无底条 ──────────────────────────────
function drawLayoutA(ctx: CanvasRenderingContext2D, img: HTMLImageElement, copy: CopyData, fontFamily: string) {
  drawCover(ctx, img, 0, 0, S, S);

  // top scrim
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, "rgba(0,0,0,0.82)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, 280);

  // main title — huge, top-left
  const [l1, l2] = splitTitle(copy.main_title);
  const tSize = l2 ? 90 : (copy.main_title.length <= 6 ? 120 : 100);
  ctx.font = `900 ${tSize}px ${fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 12;
  ctx.fillText(l1, PAD, 28);
  if (l2) ctx.fillText(l2, PAD, 28 + tSize + 6);
  ctx.shadowBlur = 0;

  // sub_title bottom-right, no banner
  if (copy.sub_title) {
    const bottomGrad = ctx.createLinearGradient(0, S - 120, 0, S);
    bottomGrad.addColorStop(0, "rgba(0,0,0,0)");
    bottomGrad.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, S - 120, S, 120);

    ctx.font = `700 24px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.fillText(copy.sub_title, S - PAD, S - 24);
    ctx.shadowBlur = 0;
  }

  // brand top-right
  if (copy.brand?.trim()) {
    ctx.font = `500 16px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(copy.brand, S - PAD, 28);
  }
}

// ── Layout B: 产品偏右 + 左侧痛点 ───────────────────────────────────────────
function drawLayoutB(ctx: CanvasRenderingContext2D, img: HTMLImageElement, copy: CopyData, fontFamily: string) {
  drawCover(ctx, img, 0, 0, S, S);

  // left scrim
  const grad = ctx.createLinearGradient(0, 0, S * 0.65, 0);
  grad.addColorStop(0, "rgba(0,0,0,0.80)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  // main title — left side, large
  const [l1, l2] = splitTitle(copy.main_title);
  const tSize = l2 ? 80 : (copy.main_title.length <= 6 ? 108 : 90);
  ctx.font = `900 ${tSize}px ${fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 10;
  ctx.fillText(l1, PAD, 60);
  if (l2) ctx.fillText(l2, PAD, 60 + tSize + 6);
  ctx.shadowBlur = 0;

  // bullets — left side below title
  const titleBottom = l2 ? 60 + tSize * 2 + 20 : 60 + tSize + 20;
  drawBullets(ctx, copy.bullets, fontFamily, PAD, titleBottom + 20, "left");

  // sub_title — bottom left
  if (copy.sub_title) {
    ctx.font = `600 22px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 4;
    ctx.fillText(copy.sub_title, PAD, S - 28);
    ctx.shadowBlur = 0;
  }
}

// ── Layout C: 产品近景全出血 + 底部文字条 ───────────────────────────────────
function drawLayoutC(ctx: CanvasRenderingContext2D, img: HTMLImageElement, copy: CopyData, fontFamily: string) {
  drawCover(ctx, img, 0, 0, S, S);

  // bottom gradient band
  const bandH = 160;
  const grad = ctx.createLinearGradient(0, S - bandH, 0, S);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.4, "rgba(0,0,0,0.72)");
  grad.addColorStop(1, "rgba(0,0,0,0.88)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, S - bandH, S, bandH);

  // main title — bottom left, large
  const [l1, l2] = splitTitle(copy.main_title);
  const tSize = l2 ? 72 : (copy.main_title.length <= 6 ? 96 : 80);
  ctx.font = `900 ${tSize}px ${fontFamily}`;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  const titleY = l2 ? S - 28 - tSize - 6 : S - 28;
  if (l2) {
    ctx.fillText(l1, PAD, titleY);
    ctx.fillText(l2, PAD, titleY + tSize + 6);
  } else {
    ctx.fillText(l1, PAD, titleY);
  }
  ctx.shadowBlur = 0;

  // sub_title — bottom right
  if (copy.sub_title) {
    ctx.font = `500 20px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.fillText(copy.sub_title, S - PAD, S - 28);
  }

  // brand top-left small
  if (copy.brand?.trim()) {
    const topGrad = ctx.createLinearGradient(0, 0, 0, 80);
    topGrad.addColorStop(0, "rgba(0,0,0,0.55)");
    topGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, S, 80);
    ctx.font = `500 16px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(copy.brand, PAD, 20);
  }
}

// ── Layout D: 产品居中大图 + 顶部人群定向 + 底条 ────────────────────────────
function drawLayoutD(ctx: CanvasRenderingContext2D, img: HTMLImageElement, copy: CopyData, fontFamily: string) {
  const BANNER_H = 72;
  drawCover(ctx, img, 0, 0, S, S - BANNER_H);

  // top scrim
  const topGrad = ctx.createLinearGradient(0, 0, 0, 100);
  topGrad.addColorStop(0, "rgba(0,0,0,0.60)");
  topGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, S, 100);

  // brand / 人群定向 top-right
  if (copy.brand?.trim()) {
    ctx.font = `600 18px ${fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 4;
    ctx.fillText(copy.brand, S - PAD, 22);
    ctx.shadowBlur = 0;
  }

  // main title top-left
  const [l1, l2] = splitTitle(copy.main_title);
  const tSize = l2 ? 80 : (copy.main_title.length <= 6 ? 108 : 90);
  ctx.font = `900 ${tSize}px ${fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 10;
  ctx.fillText(l1, PAD, 22);
  if (l2) ctx.fillText(l2, PAD, 22 + tSize + 6);
  ctx.shadowBlur = 0;

  // bullets right side, above banner
  const bulletsBottom = S - BANNER_H - 20;
  const bulletH = 36;
  const bulletGap = 10;
  const bulletsTop = bulletsBottom - (copy.bullets.slice(0, 2).length * (bulletH + bulletGap));
  drawBullets(ctx, copy.bullets, fontFamily, S - 24, bulletsTop, "right");

  // bottom banner
  ctx.fillStyle = "#1C1C1E";
  ctx.fillRect(0, S - BANNER_H, S, BANNER_H);

  if (copy.sub_title) {
    const stampText = copy.new_badge?.trim() || "";
    ctx.font = `700 24px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(copy.sub_title, (S - (stampText ? 72 : 0)) / 2, S - BANNER_H / 2, S - PAD * 2 - (stampText ? 80 : 0));
  }

  // stamp badge
  const stampText = copy.new_badge?.trim() || "";
  if (stampText) {
    const stampR = 32;
    const stampX = S - 20 - stampR;
    const stampY = S - BANNER_H / 2;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(stampX, stampY, stampR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#C9A95C";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(stampX, stampY, stampR - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1A1A1A";
    ctx.font = `700 12px ${fontFamily}`;
    ctx.fillText(stampText.slice(0, 5), stampX, stampY);
  }
}

export async function synthesizeTemplate1(
  baseImageUrl: string,
  copy: CopyData,
  _productImageUrl?: string,
  layoutVariant?: string,
): Promise<string> {
  const fontFamily = getFontFamily();
  await waitForFonts(fontFamily);
  const img = await loadImage(baseImageUrl);

  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");

  const variant = layoutVariant ?? "A";
  if (variant === "B") drawLayoutB(ctx, img, copy, fontFamily);
  else if (variant === "C") drawLayoutC(ctx, img, copy, fontFamily);
  else if (variant === "D") drawLayoutD(ctx, img, copy, fontFamily);
  else drawLayoutA(ctx, img, copy, fontFamily);

  // JPEG is ~5x smaller than PNG for photos — critical to avoid OOM in dev.
  // Return an Object URL (backed by a Blob) instead of a base64 data URL so
  // the string in React state is tiny (~60 chars) and the bitmap lives in the
  // browser's Blob store, not the JS heap.
  const result = await new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error("canvas.toBlob returned null")); return; }
        resolve(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.85,
    );
  });

  // Release canvas memory immediately — large canvases are not GC'd promptly.
  canvas.width = 0;
  canvas.height = 0;
  // Release the decoded image bitmap held by the HTMLImageElement.
  img.src = "";

  return result;
}
