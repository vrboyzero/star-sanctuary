import { enUS } from "./en-US.js";
import { zhCN } from "./zh-CN.js";

export const LOCALE_DICTIONARIES = Object.freeze({
  "zh-CN": zhCN,
  "en-US": enUS,
});

export const LOCALE_META = Object.freeze({
  "zh-CN": Object.freeze({
    code: "zh-CN",
    label: "简体中文",
    speechRecognitionLocale: "zh-CN",
  }),
  "en-US": Object.freeze({
    code: "en-US",
    label: "English",
    speechRecognitionLocale: "en-US",
  }),
});
