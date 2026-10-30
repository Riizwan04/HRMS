import { sample } from "@/lib/preview-data";
import { formatDateTimeIST, nowIST } from "@/lib/time/ist";

/** Header date line: the sample clock in demo mode, the real IST time otherwise. */
export const dateLineFor = (demo: boolean) => formatDateTimeIST(demo ? sample.nowIso : nowIST());
