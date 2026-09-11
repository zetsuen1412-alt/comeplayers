import { getCountries as listCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/core";
import metadata from "libphonenumber-js/metadata.max.json";

const countries = new Set<string>(listCountries(metadata));
export function phoneCountry(value: unknown): CountryCode {
  const country = String(value || "ID").toUpperCase();
  if (!countries.has(country)) throw Object.assign(new Error("Choose a valid phone country."), { status: 400 });
  return country as CountryCode;
}
export function normalizePhone(value: unknown, country: unknown = "ID") {
  const region = phoneCountry(country);
  const raw = String(value || "").trim();
  if (!raw || raw.length > 40 || !/^[+\d\s().-]+$/.test(raw)) throw Object.assign(new Error("Enter a complete valid phone number."), { status: 400 });
  const number = parsePhoneNumberFromString(raw.startsWith("00") ? `+${raw.slice(2)}` : raw, { defaultCountry: region, extract: false }, metadata);
  if (!number?.isValid() || number.ext) throw Object.assign(new Error("The phone number is not valid for the selected country."), { status: 400 });
  return { e164: String(number.number), country: number.country || region, national: number.formatNational() };
}
export function phoneCountries() {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return listCountries(metadata).map(code => ({ code, name: names.of(code) || code, callingCode: `+${getCountryCallingCode(code, metadata)}` })).sort((a, b) => a.name.localeCompare(b.name));
}
