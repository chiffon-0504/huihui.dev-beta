import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const locales = ["zh", "en", "ja"];

const expected = {
  zh: {
    uploadCountLimit: "已達 50 張圖片上限，多餘的檔案未新增。",
    uploadFileTooLarge: "{file} 未新增：檔案大小超過 10 MiB。",
    uploadDimensionsTooLarge:
      "{file} 未新增：圖片尺寸超過 4096 × 4096 像素。",
    uploadInvalidImage: "{file} 未新增：無法讀取這個圖片檔案。",
    uploadSuccess: "已新增 {count} 張圖片。",
    exportSuccess: "PNG 下載已開始。",
    exportFailure: "無法建立 PNG，請再試一次。",
  },
  en: {
    uploadCountLimit:
      "The 50-image limit was reached. Extra files were not added.",
    uploadFileTooLarge:
      "{file} was not added because it exceeds 10 MiB.",
    uploadDimensionsTooLarge:
      "{file} was not added because its dimensions exceed 4096 × 4096 pixels.",
    uploadInvalidImage:
      "{file} was not added because it is not a readable image.",
    uploadSuccess: "Images added: {count}.",
    exportSuccess: "PNG download started.",
    exportFailure: "The PNG could not be created. Please try again.",
  },
  ja: {
    uploadCountLimit:
      "画像数が上限の50枚に達したため、残りのファイルは追加されませんでした。",
    uploadFileTooLarge:
      "{file} は追加されませんでした。ファイルサイズが10 MiBを超えています。",
    uploadDimensionsTooLarge:
      "{file} は追加されませんでした。画像サイズが4096 × 4096ピクセルを超えています。",
    uploadInvalidImage:
      "{file} は追加されませんでした。画像ファイルを読み込めません。",
    uploadSuccess: "{count}枚の画像を追加しました。",
    exportSuccess: "PNGのダウンロードを開始しました。",
    exportFailure: "PNGを作成できませんでした。もう一度お試しください。",
  },
};

async function loadTierMakerMessages() {
  const context = { window: {} };
  vm.createContext(context);

  for (const locale of locales) {
    const relativePath = `js/locales/${locale}.js`;
    const source = await readFile(path.join(root, relativePath), "utf8");
    vm.runInContext(source, context, { filename: relativePath });
  }

  return context.window.HUIHUI_I18N;
}

describe("Tier Maker robustness locale copy", () => {
  test("defines the approved upload and export messages exactly", async () => {
    const messages = await loadTierMakerMessages();

    for (const locale of locales) {
      const tierMaker = messages[locale].tierMaker;

      for (const [key, value] of Object.entries(expected[locale])) {
        expect(tierMaker[key], `${locale}.${key}`).toBe(value);
      }
    }
  });

  test("keeps identical Tier Maker key structures across locales", async () => {
    const messages = await loadTierMakerMessages();
    const expectedKeys = Object.keys(messages.zh.tierMaker).sort();

    for (const locale of locales) {
      expect(Object.keys(messages[locale].tierMaker).sort()).toEqual(
        expectedKeys,
      );
    }
  });
});
