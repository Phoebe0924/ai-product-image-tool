import { mkdir, readdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INPUT_DIR = path.join(ROOT, "eval-inputs");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const OUTPUT_DIR = path.join(ROOT, "eval-runs", RUN_ID);
const BASE_URL = process.env.LIGHTPIC_EVAL_BASE_URL ?? "http://localhost:3000";
const EVAL_MODE = process.env.LIGHTPIC_EVAL_MODE ?? "single";

const MATRIX_TARGETS = [
  { id: "traffic", label: "提升点击" },
  { id: "selling-point", label: "讲清卖点" },
  { id: "scene", label: "增强信任" },
];

const REPRESENTATIVE_PATTERNS = [
  /防晒霜1/i,
  /隔离霜/i,
  /卸妆油/i,
  /儿童面霜/i,
];

const SUPPORTED = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

function extOf(file) {
  return path.extname(file).toLowerCase();
}

function safeName(input, index) {
  const stem = path.basename(input, path.extname(input)).replace(/[^\p{L}\p{N}_-]+/gu, "-");
  return `${String(index + 1).padStart(2, "0")}-${stem}`;
}

function selectFiles(files) {
  if (EVAL_MODE !== "matrix") return files;
  const selected = [];
  for (const pattern of REPRESENTATIVE_PATTERNS) {
    const file = files.find((candidate) => pattern.test(candidate));
    if (file && !selected.includes(file)) selected.push(file);
  }
  return selected;
}

async function fileToDataUrl(filePath) {
  const ext = extOf(filePath);
  const mime = MIME_BY_EXT[ext] ?? "image/jpeg";
  const buf = await readFile(filePath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function fetchJson(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { __nonJson: text.slice(0, 1000) };
    }
    if (!res.ok) {
      throw new Error(`${res.status} ${JSON.stringify(data).slice(0, 1200)}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function saveImage(imageUrl, outPath) {
  if (imageUrl.startsWith("data:image/")) {
    const match = imageUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data image URL");
    await writeFile(outPath, Buffer.from(match[2], "base64"));
    return;
  }

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download image ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, bytes);
}

function markdownReport(results) {
  const lines = [
    "# LightPic Main Image Eval",
    "",
    `Run: ${RUN_ID}`,
    `Base URL: ${BASE_URL}`,
    `Images: ${results.length}`,
    "",
    "## Results",
    "",
    "| # | Input | Goal | Status | Product Type | Main Title | Subtitle | Output | Notes |",
    "|---|---|---|---|---|---|---|---|---|",
  ];

  for (const r of results) {
    const brief = r.brief ?? {};
    lines.push(
      [
        r.index + 1,
        r.input,
        r.outputUseLabel ?? "",
        r.status,
        brief.product_type ?? "",
        brief.main_title ?? "",
        brief.subtitle ?? "",
        r.outputImage ? `[image](${r.outputImage})` : "",
        r.error ? String(r.error).replace(/\n/g, " ").slice(0, 160) : "",
      ].map((v) => ` ${String(v).replace(/\|/g, "/")} `).join("|"),
    );
  }

  lines.push("");
  lines.push("## Manual Scoring Rubric");
  lines.push("");
  lines.push("Score each generated main image with 0/1:");
  lines.push("");
  lines.push("- Product fidelity: package shape/color/logo preserved");
  lines.push("- Business goal fit: supports click / understanding / trust for the selected goal");
  lines.push("- Operational usefulness: seller would plausibly use it after minor review");
  lines.push("- Risk control: no obvious false claim, fake certification, or unusable baked text");
  lines.push("");
  lines.push("Common failure tags: `deformed-product`, `wrong-color`, `weak-commerce`, `fake-copy`, `text-chaos`, `slow`, `api-failed`.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const allFiles = (await readdir(INPUT_DIR))
    .filter((file) => SUPPORTED.has(extOf(file)))
    .sort();
  const files = selectFiles(allFiles);

  if (files.length === 0) {
    throw new Error(`No supported images found in ${INPUT_DIR}`);
  }

  console.log(`[eval] run=${RUN_ID}`);
  console.log(`[eval] mode=${EVAL_MODE}`);
  console.log(`[eval] input count=${files.length}`);
  console.log(`[eval] output=${OUTPUT_DIR}`);

  const results = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const inputPath = path.join(INPUT_DIR, file);
    const itemName = safeName(file, index);
    const itemDir = path.join(OUTPUT_DIR, itemName);
    await mkdir(itemDir, { recursive: true });

    const copiedInput = `input${extOf(file)}`;
    await copyFile(inputPath, path.join(itemDir, copiedInput));

    try {
      console.log(`[eval] ${index + 1}/${files.length} analyze ${file}`);
      const imageDataUrl = await fileToDataUrl(inputPath);
      const analyzed = await fetchJson(`${BASE_URL}/api/analyze`, { imageDataUrl }, 70_000);
      await writeFile(path.join(itemDir, "analyze-response.json"), JSON.stringify(analyzed, null, 2));

      if (analyzed.unsupported) {
        const result = {
          index,
          input: file,
          outputUse: null,
          outputUseLabel: "",
          status: "unsupported",
          inputImage: path.join(itemName, copiedInput),
          outputImage: null,
          brief: null,
          error: analyzed.reason ?? "unsupported",
        };
        results.push(result);
        console.log(`[eval] ${index + 1}/${files.length} unsupported: ${result.error}`);
        continue;
      }

      const brief = analyzed.brief;
      if (!brief) throw new Error("Analyze returned no brief");

      const targets = EVAL_MODE === "matrix" ? MATRIX_TARGETS : [MATRIX_TARGETS[0]];
      for (const target of targets) {
        const result = {
          index,
          input: file,
          outputUse: target.id,
          outputUseLabel: target.label,
          status: "pending",
          inputImage: path.join(itemName, copiedInput),
          outputImage: null,
          brief,
          error: null,
        };

        try {
          console.log(`[eval] ${index + 1}/${files.length} generate ${file} / ${target.label}`);
          const generated = await fetchJson(
            `${BASE_URL}/api/generate`,
            {
              imageDataUrl,
              brief,
              outputUse: target.id,
              outputMode: "copy",
              platform: "pdd",
              nonce: `${RUN_ID}-${index}-${target.id}`,
            },
            130_000,
          );
          await writeFile(path.join(itemDir, `generate-response-${target.id}.json`), JSON.stringify(generated, null, 2));

          if (!generated.imageUrl) throw new Error("Generate returned no imageUrl");

          const outputRel = path.join(itemName, `output-${target.id}.png`);
          await saveImage(generated.imageUrl, path.join(OUTPUT_DIR, outputRel));
          result.outputImage = outputRel;
          result.status = "done";
          console.log(`[eval] ${index + 1}/${files.length} done ${target.label}`);
        } catch (e) {
          result.status = "error";
          result.error = e instanceof Error ? e.message : String(e);
          await writeFile(path.join(itemDir, `error-${target.id}.txt`), result.error);
          console.log(`[eval] ${index + 1}/${files.length} error ${target.label}: ${result.error}`);
        }

        results.push(result);
        await writeFile(path.join(OUTPUT_DIR, "results.json"), JSON.stringify(results, null, 2));
        await writeFile(path.join(OUTPUT_DIR, "REPORT.md"), markdownReport(results));
        await sleep(1500);
      }
    } catch (e) {
      const result = {
        index,
        input: file,
        outputUse: null,
        outputUseLabel: "",
        status: "error",
        inputImage: path.join(itemName, copiedInput),
        outputImage: null,
        brief: null,
        error: e instanceof Error ? e.message : String(e),
      };
      await writeFile(path.join(itemDir, "error.txt"), result.error);
      results.push(result);
      console.log(`[eval] ${index + 1}/${files.length} error: ${result.error}`);
    }
    await writeFile(path.join(OUTPUT_DIR, "results.json"), JSON.stringify(results, null, 2));
    await writeFile(path.join(OUTPUT_DIR, "REPORT.md"), markdownReport(results));

    // Keep external image provider pressure modest.
    if (index < files.length - 1) await sleep(1500);
  }

  await writeFile(path.join(OUTPUT_DIR, "results.json"), JSON.stringify(results, null, 2));
  await writeFile(path.join(OUTPUT_DIR, "REPORT.md"), markdownReport(results));
  console.log(`[eval] complete ${OUTPUT_DIR}`);
}

main().catch((e) => {
  console.error("[eval] fatal:", e);
  process.exit(1);
});
