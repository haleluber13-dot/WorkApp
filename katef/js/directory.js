/* The organization directory: the curated list in data/orgs.json plus every
   organization that registered on the platform. Also the matching logic used
   by the "find help" wizard and by organizations' "requests for you" feed. */
import { store } from "./store.js";

let curated = null;

export async function loadCurated() {
  if (curated) return curated;
  try {
    const res = await fetch("./data/orgs.json");
    curated = (await res.json()).map((o) => ({ ...o, source: o.source || "", onPlatform: false }));
  } catch {
    curated = [];
  }
  return curated;
}

export async function allOrgs() {
  const [list, registered] = await Promise.all([loadCurated(), store.listOrgs().catch(() => [])]);
  const reg = registered.map((o) => ({
    id: "p:" + o.id, platformId: o.id, name: o.name, nameEn: "", desc: o.description, categories: o.categories || [],
    audiences: o.audiences || [], regions: o.regions || [], phone: o.phone || "", whatsapp: "", website: o.website || "",
    email: o.email || "", hours: "", type: "nonprofit", verified: !!o.verified, onPlatform: true, regNumber: o.regNumber || "",
    demo: !!o.demo,
  }));
  return [...reg, ...list];
}

/* Score how well an organization fits someone: categories matter most, then
   audience, then region. Returns 0 when the region rules it out. */
export function scoreOrg(org, { categories = [], audience = "", region = "" }) {
  const regions = org.regions?.length ? org.regions : ["all"];
  if (region && !regions.includes("all") && !regions.includes(region)) return 0;
  const catHits = categories.filter((c) => org.categories?.includes(c)).length;
  if (categories.length && !catHits) return 0;
  let s = catHits * 10;
  const aud = org.audiences || [];
  if (audience && aud.includes(audience)) s += 6;
  else if (audience && aud.length && !aud.includes("general")) s -= 4; /* serves a specific other group */
  if (region && regions.includes(region)) s += 3;
  if (org.onPlatform && org.verified) s += 2; /* can take a request on the platform */
  if (org.type === "government") s += 1;
  return Math.max(1, s);
}

export function matchOrgs(orgs, query) {
  return orgs
    .map((o) => ({ o, s: scoreOrg(o, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.o);
}

/* Does a request fit an organization's declared focus? */
export function requestFitsOrg(req, org) {
  if (!org) return false;
  const regions = org.regions?.length ? org.regions : ["all"];
  const regionOk = regions.includes("all") || regions.includes(req.region);
  const catOk = !org.categories?.length || req.categories.some((c) => org.categories.includes(c));
  return regionOk && catOk;
}

/* Kol Zchut (the Israeli rights wiki) and gov.il pages to read about rights,
   as searches so the links stay valid when articles are renamed. */
const KZ = (q) => "https://www.kolzchut.org.il/he/Special:Search?search=" + encodeURIComponent(q);
export const RIGHTS = {
  soldier: [["זכויות חיילים בשירות סדיר", KZ("זכויות חיילים בשירות סדיר")]],
  reservist: [["זכויות משרתי מילואים", KZ("זכויות משרתי מילואים")], ["מענקים לעצמאים במילואים", KZ("עצמאים משרתי מילואים מענק")]],
  reservist_family: [["זכויות בני זוג של משרתי מילואים", KZ("בני זוג של משרתי מילואים")]],
  lone_soldier: [["זכויות חיילים בודדים", KZ("חייל בודד")]],
  wounded: [["הכרה ושיקום — אגף השיקום", KZ("אגף השיקום משרד הביטחון הכרה")], ["תגובת קרב ופוסט טראומה", KZ("תגובת קרב פוסט טראומה")]],
  bereaved: [["זכויות משפחות שכולות", KZ("משפחות שכולות צה\"ל")]],
  veteran: [["זכויות נכי צה״ל", KZ("נכי צה\"ל")]],
  released: [["זכויות חיילים משוחררים", KZ("חיילים משוחררים")]],
  evacuee: [["זכויות מפונים ותושבי קו העימות", KZ("מפונים מלחמת חרבות ברזל")]],
  general: [["מיצוי זכויות — כל זכות", "https://www.kolzchut.org.il/"]],
};
export const RIGHTS_ENGINE = "https://www.gov.il/he/service/national-rights-engine-service";
