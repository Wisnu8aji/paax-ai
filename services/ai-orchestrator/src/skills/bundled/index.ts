import { RAB_SKILL_MD } from "./rab";
import { GAMBAR_KERJA_SKILL_MD } from "./gambar-kerja";
import { SCHEDULING_SKILL_MD } from "./scheduling";
import { QUANTITY_TAKEOFF_SKILL_MD } from "./quantity-takeoff";
import { DOCUMENT_INTELLIGENCE_SKILL_MD } from "./document-intelligence";

export const BUNDLED_SKILLS: Readonly<Record<string, string>> = Object.freeze({
  "rab": RAB_SKILL_MD,
  "gambar-kerja": GAMBAR_KERJA_SKILL_MD,
  "scheduling": SCHEDULING_SKILL_MD,
  "quantity-takeoff": QUANTITY_TAKEOFF_SKILL_MD,
  "document-intelligence": DOCUMENT_INTELLIGENCE_SKILL_MD,
});

export * from "./rab";
export * from "./gambar-kerja";
export * from "./scheduling";
export * from "./quantity-takeoff";
export * from "./document-intelligence";
