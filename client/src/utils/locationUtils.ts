import { TransactionLocation } from "@/types";

export interface LocationSearchSuggestion {
  id: string;
  placeName?: string;
  streetAddress: string;
  city: string;
  address: string;
  subtitle?: string;
  lat: number;
  lng: number;
}

interface NominatimAddressDetails {
  road?: string;
  pedestrian?: string;
  footway?: string;
  street?: string;
  path?: string;
  house_number?: string;
  house_name?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  city_district?: string;
  borough?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state_district?: string;
  state?: string;
  country?: string;
  country_code?: string;
  mall?: string;
  shop?: string;
  supermarket?: string;
  department_store?: string;
  convenience?: string;
  marketplace?: string;
  amenity?: string;
  restaurant?: string;
  cafe?: string;
  fast_food?: string;
  bar?: string;
  pub?: string;
  pharmacy?: string;
  hospital?: string;
  clinic?: string;
  doctors?: string;
  dentist?: string;
  bank?: string;
  atm?: string;
  fuel?: string;
  hotel?: string;
  guest_house?: string;
  tourism?: string;
  attraction?: string;
  museum?: string;
  leisure?: string;
  park?: string;
  fitness_centre?: string;
  sports_centre?: string;
  cinema?: string;
  theatre?: string;
  office?: string;
  commercial?: string;
  retail?: string;
  healthcare?: string;
  club?: string;
  public_transport?: string;
  railway?: string;
  station?: string;
  aeroway?: string;
  craft?: string;
  university?: string;
  school?: string;
  kindergarten?: string;
  post_office?: string;
  police?: string;
  building?: string;
}

interface NominatimSearchResult {
  place_id: number | string;
  lat: string;
  lon: string;
  display_name: string;
  category?: string;
  type?: string;
  name?: string;
  namedetails?: Record<string, string | undefined>;
  extratags?: Record<string, string | undefined>;
  address?: NominatimAddressDetails;
}

const HIGHWAY_ROAD_TYPES = new Set([
  "residential",
  "primary",
  "secondary",
  "tertiary",
  "trunk",
  "motorway",
  "unclassified",
  "service",
  "living_street",
  "pedestrian",
  "footway",
  "path",
  "cycleway",
  "track",
  "road",
  "steps",
]);

const GEOGRAPHIC_PLACE_TYPES = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "suburb",
  "quarter",
  "neighbourhood",
  "borough",
  "municipality",
  "county",
  "state",
  "country",
  "region",
  "locality",
  "isolated_dwelling",
  "allotments",
]);

const ADDRESS_POI_KEYS: Array<keyof NominatimAddressDetails> = [
  "mall",
  "supermarket",
  "department_store",
  "shop",
  "convenience",
  "marketplace",
  "amenity",
  "restaurant",
  "cafe",
  "fast_food",
  "bar",
  "pub",
  "pharmacy",
  "hospital",
  "clinic",
  "doctors",
  "dentist",
  "bank",
  "atm",
  "fuel",
  "hotel",
  "guest_house",
  "tourism",
  "attraction",
  "museum",
  "leisure",
  "park",
  "fitness_centre",
  "sports_centre",
  "cinema",
  "theatre",
  "office",
  "commercial",
  "retail",
  "healthcare",
  "club",
  "public_transport",
  "railway",
  "station",
  "aeroway",
  "craft",
  "university",
  "school",
  "kindergarten",
  "post_office",
  "police",
];

/**
 * Normalizes a TransactionLocation object. Returns undefined if both placeName and address are empty.
 */
export function normalizeLocation(
  location?: TransactionLocation | null
): TransactionLocation | undefined {
  if (!location || typeof location !== "object") return undefined;

  const trimmedPlaceName =
    typeof location.placeName === "string" ? location.placeName.trim() : "";
  const trimmedAddress =
    typeof location.address === "string" ? location.address.trim() : "";

  if (!trimmedAddress && !trimmedPlaceName) return undefined;

  const hasCoords =
    typeof location.lat === "number" &&
    Number.isFinite(location.lat) &&
    typeof location.lng === "number" &&
    Number.isFinite(location.lng);

  const normalized: TransactionLocation = {
    address: trimmedAddress,
  };

  if (
    trimmedPlaceName &&
    trimmedPlaceName.toLowerCase() !== trimmedAddress.toLowerCase()
  ) {
    normalized.placeName = trimmedPlaceName;
  }

  if (hasCoords) {
    normalized.lat = location.lat;
    normalized.lng = location.lng;
  }

  return normalized;
}

/**
 * Checks whether a TransactionLocation carries a displayable placeName or address.
 */
export function hasLocationData(
  location?: TransactionLocation | null
): boolean {
  return Boolean(normalizeLocation(location));
}

/**
 * Formats a TransactionLocation into a single readable string for text/Excel exports.
 */
export function formatLocationExportLabel(
  location?: TransactionLocation | null
): string {
  const norm = normalizeLocation(location);
  if (!norm) return "";
  if (norm.placeName && norm.address) {
    return `${norm.placeName} (${norm.address})`;
  }
  return norm.placeName || norm.address;
}

/**
 * Compares two optional TransactionLocation objects for structural equality.
 */
export function areLocationsEqual(
  a?: TransactionLocation | null,
  b?: TransactionLocation | null
): boolean {
  const normA = normalizeLocation(a);
  const normB = normalizeLocation(b);
  if (!normA && !normB) return true;
  if (!normA || !normB) return false;
  return (
    (normA.placeName || "") === (normB.placeName || "") &&
    normA.address === normB.address &&
    normA.lat === normB.lat &&
    normA.lng === normB.lng
  );
}

/**
 * Builds a clean, free Google Maps URL without requiring any Google Maps API key.
 * When a recognizable placeName exists, queries the named place + address so Google Maps
 * opens the place card directly instead of dropping a generic coordinate pin.
 */
export function buildGoogleMapsUrl(location: TransactionLocation): string {
  const placeName = (location.placeName || "").trim();
  const address = (location.address || "").trim();
  const hasCoords =
    typeof location.lat === "number" &&
    Number.isFinite(location.lat) &&
    typeof location.lng === "number" &&
    Number.isFinite(location.lng);

  let queryValue = "";
  if (placeName) {
    if (address && !address.toLowerCase().includes(placeName.toLowerCase())) {
      queryValue = `${placeName}, ${address}`;
    } else {
      queryValue = address || placeName;
    }
  } else if (hasCoords) {
    queryValue = `${location.lat},${location.lng}`;
  } else {
    queryValue = address;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryValue)}`;
}

function cleanMunicipalityName(raw?: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const cleaned = trimmed
    .replace(/^(?:Община|община|Общ\.|общ\.|Municipality\s+of|Municipality)\s+/i, "")
    .trim();
  if (/^(?:Столична|Stolichna)$/i.test(cleaned)) {
    return "София";
  }
  return cleaned;
}

function cleanCountyName(raw?: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const cleaned = trimmed
    .replace(/^(?:Област|област|Обл\.|обл\.|Province|District)\s+/i, "")
    .trim();
  if (/^(?:София-град|София град|Sofia-city|Sofia City)$/i.test(cleaned)) {
    return "София";
  }
  return cleaned;
}

function resolveCityName(addr?: NominatimAddressDetails): string {
  if (!addr) return "";

  const direct = (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.hamlet ||
    ""
  ).trim();
  if (direct) return direct;

  const muni = cleanMunicipalityName(addr.municipality);
  if (muni) return muni;

  const county = cleanCountyName(addr.county);
  if (county) return county;

  return "";
}

function isPureHouseOrPostcode(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^\d{3,6}$/.test(trimmed)) return true;
  if (/^\d{1,5}[a-zа-я]?$/i.test(trimmed)) return true;
  return false;
}

/**
 * Extracts structured Place Name, Street Address, City, and combined Address
 * from an OpenStreetMap Nominatim result. Returns `placeName: undefined` when
 * no distinct POI / place name exists (pure street/house/city fallback).
 */
export function extractPlaceAndAddress(result: NominatimSearchResult): {
  placeName?: string;
  streetAddress: string;
  city: string;
  address: string;
  subtitle?: string;
} {
  const addr = result.address;
  const namedetails = result.namedetails;
  const extratags = result.extratags;

  if (!addr) {
    return {
      placeName: undefined,
      streetAddress: result.display_name,
      city: "",
      address: result.display_name,
    };
  }

  const road = (
    addr.road ||
    addr.pedestrian ||
    addr.footway ||
    addr.street ||
    addr.path ||
    ""
  ).trim();
  const houseNumber = (addr.house_number || "").trim();
  const houseName = (addr.house_name || "").trim();

  let streetAddress = road
    ? `${road}${houseNumber ? ` ${houseNumber}` : ""}`.trim()
    : houseName;

  const area = (
    addr.quarter ||
    addr.suburb ||
    addr.neighbourhood ||
    addr.city_district ||
    addr.borough ||
    ""
  ).trim();

  const cityName = resolveCityName(addr);
  const postcode = (addr.postcode || "").trim();
  const city = cityName
    ? `${cityName}${postcode ? ` ${postcode}` : ""}`.trim()
    : postcode;

  // Determine whether this result represents a named POI vs a plain street/house/place
  const category = (result.category || "").toLowerCase();
  const type = (result.type || "").toLowerCase();
  const isPlainStreet = category === "highway" && HIGHWAY_ROAD_TYPES.has(type);
  const isGeographicPlace =
    category === "place" && GEOGRAPHIC_PLACE_TYPES.has(type);
  const isBoundary = category === "boundary";

  let placeName: string | undefined;

  if (!isPlainStreet && !isGeographicPlace && !isBoundary) {
    const blockedValues = new Set(
      [
        road,
        streetAddress,
        houseNumber,
        postcode,
        cityName,
        city,
        area,
        addr.county,
        addr.state,
        addr.country,
        "yes",
        "true",
        "building",
        "house",
      ]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim().toLowerCase())
    );

    const candidates: Array<string | undefined> = [
      namedetails?.["name:bg"],
      result.name,
      namedetails?.name,
      namedetails?.["name:en"],
      namedetails?.short_name,
      namedetails?.official_name,
      result.type
        ? (addr as Record<string, string | undefined>)[result.type]
        : undefined,
      ...ADDRESS_POI_KEYS.map((key) => addr[key]),
      addr.building && !/^(yes|true)$/i.test(addr.building.trim())
        ? addr.building
        : undefined,
      extratags?.brand || namedetails?.brand,
    ];

    for (const raw of candidates) {
      const cleaned = (raw || "").trim();
      if (!cleaned) continue;
      if (isPureHouseOrPostcode(cleaned)) continue;
      if (blockedValues.has(cleaned.toLowerCase())) continue;
      placeName = cleaned;
      break;
    }

    // Append OSM branch tag when brand name omits branch (e.g. "Lidl" + "Тракия" -> "Lidl Тракия")
    const branch = (extratags?.branch || namedetails?.branch || "").trim();
    if (
      placeName &&
      branch &&
      !isPureHouseOrPostcode(branch) &&
      !placeName.toLowerCase().includes(branch.toLowerCase())
    ) {
      placeName = `${placeName} ${branch}`;
    }
  }

  // Fallback street line to area/quarter when no road exists on POI
  if (
    !streetAddress &&
    area &&
    area.toLowerCase() !== cityName.toLowerCase() &&
    area.toLowerCase() !== (placeName || "").toLowerCase()
  ) {
    streetAddress = area;
  }

  const combinedParts = [streetAddress, city].filter(Boolean);
  let address =
    combinedParts.length > 0 ? combinedParts.join(", ") : result.display_name;

  // Guard against empty street + empty city falling back to display_name equal to placeName
  if (
    placeName &&
    address.trim().toLowerCase() === placeName.trim().toLowerCase()
  ) {
    placeName = undefined;
  }

  // If still no streetAddress (e.g. display_name fallback), populate streetAddress cleanly
  if (!streetAddress && !city) {
    streetAddress = address;
  }

  const secondaryParts: string[] = [];
  if (
    area &&
    !streetAddress.toLowerCase().includes(area.toLowerCase()) &&
    area.toLowerCase() !== (placeName || "").toLowerCase() &&
    area.toLowerCase() !== cityName.toLowerCase()
  ) {
    secondaryParts.push(area);
  }
  if (addr.country) secondaryParts.push(addr.country);

  return {
    placeName,
    streetAddress,
    city,
    address,
    subtitle:
      secondaryParts.length > 0 ? secondaryParts.join(", ") : undefined,
  };
}

/**
 * Queries the free OpenStreetMap Nominatim Geocoding API for place & address suggestions.
 */
export async function searchNominatimAddresses(
  query: string,
  signal?: AbortSignal
): Promise<LocationSearchSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    namedetails: "1",
    extratags: "1",
    limit: "8",
    "accept-language": "bg,en",
    q: trimmed,
  });

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Address lookup failed (${response.status})`);
  }

  const data = (await response.json()) as NominatimSearchResult[];
  if (!Array.isArray(data)) return [];

  const results: LocationSearchSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of data) {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const extracted = extractPlaceAndAddress(item);
    const dedupeKey = `${(extracted.placeName || "").toLowerCase()}|${extracted.address.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({
      id: String(item.place_id),
      placeName: extracted.placeName,
      streetAddress: extracted.streetAddress,
      city: extracted.city,
      address: extracted.address,
      subtitle: extracted.subtitle,
      lat,
      lng,
    });
  }

  return results;
}

export interface ReceiptLocationSelectionInput {
  placeName?: string;
  address: string;
  isCompanyHq?: boolean;
}

const PLACEHOLDER_MERCHANT_RE =
  /^(?:касова\s+бележка|неизвестен\s+търговец|неразпознат\s+търговец|receipt|unknown(?:\s+merchant)?|n\/a)$/i;

/**
 * Returns a clean Merchant name usable as Location Name, or undefined when missing/placeholder.
 */
export function resolveMerchantForLocationName(
  merchantName?: string | null
): string | undefined {
  const trimmed = typeof merchantName === "string" ? merchantName.trim() : "";
  if (!trimmed || PLACEHOLDER_MERCHANT_RE.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function normalizeAddressSelectionKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/№/g, " ")
    .replace(/[,.;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Orders detected receipt location candidates (company/HQ candidates first, store/latest candidates last),
 * automatically selects the LAST candidate when multiple candidates exist,
 * and applies Merchant as Location Name whenever available (falling back to OCR-derived names only when Merchant is missing).
 */
export function buildReceiptLocationSelection(params: {
  candidates: ReceiptLocationSelectionInput[];
  merchantName?: string | null;
  isHqAddress?: (address: string) => boolean;
}): {
  selectedLocation: TransactionLocation | undefined;
  orderedCandidates: Array<{ placeName?: string; address: string }>;
} {
  const effectiveMerchant = resolveMerchantForLocationName(params.merchantName);

  const deduped: Array<ReceiptLocationSelectionInput & { hq: boolean }> = [];
  const keyToIndex = new Map<string, number>();

  for (const raw of params.candidates) {
    const norm = normalizeLocation(raw);
    if (!norm || !norm.address) continue;

    const key = normalizeAddressSelectionKey(norm.address);
    const hq = Boolean(raw.isCompanyHq || params.isHqAddress?.(norm.address));

    if (keyToIndex.has(key)) {
      const existingIdx = keyToIndex.get(key)!;
      const existing = deduped[existingIdx];
      // Prefer version with richer address symbol (e.g. №) or non-empty placeName
      const preferNewAddress =
        norm.address.includes("№") && !existing.address.includes("№");
      deduped[existingIdx] = {
        address: preferNewAddress ? norm.address : existing.address,
        placeName: existing.placeName || norm.placeName,
        isCompanyHq: existing.isCompanyHq || raw.isCompanyHq,
        hq: existing.hq || hq,
      };
      continue;
    }

    keyToIndex.set(key, deduped.length);
    deduped.push({
      ...(norm.placeName ? { placeName: norm.placeName } : {}),
      address: norm.address,
      isCompanyHq: raw.isCompanyHq,
      hq,
    });
  }

  if (deduped.length === 0) {
    return { selectedLocation: undefined, orderedCandidates: [] };
  }

  // Place company/HQ candidates before store/later candidates so the LAST candidate is always the latest/store location
  const hqList = deduped.filter((c) => c.hq);
  const storeList = deduped.filter((c) => !c.hq);
  const orderedRaw = [...hqList, ...storeList];
  const lastIdx = orderedRaw.length - 1;

  const orderedCandidates = orderedRaw.map((cand, idx) => {
    const isLastOrStore = idx === lastIdx || !cand.hq;
    const resolvedPlaceName = isLastOrStore
      ? effectiveMerchant || cand.placeName
      : cand.placeName || effectiveMerchant;

    return {
      ...(resolvedPlaceName ? { placeName: resolvedPlaceName } : {}),
      address: cand.address,
    };
  });

  // Automatically select the LAST detected receipt location when >1 candidates exist (and the sole candidate when 1 exists)
  const chosen = orderedCandidates[lastIdx];
  const selectedLocation = normalizeLocation({
    ...(chosen.placeName ? { placeName: chosen.placeName } : {}),
    address: chosen.address,
  });

  return {
    selectedLocation,
    orderedCandidates,
  };
}

