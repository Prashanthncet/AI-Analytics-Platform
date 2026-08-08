/** Returns a trimmed string if v is a non-empty string, otherwise undefined. */
export const asString = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

/** Returns a finite number from a number or numeric string, otherwise undefined. */
export const asNumber = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return undefined;
};

/** Returns a valid Date from a string/Date, otherwise undefined. */
export const asDate = (v: unknown): Date | undefined => {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) return d;
    }
    return undefined;
};

/** Returns a string if it is in the allowed list, otherwise undefined. */
export const asEnum = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

/** Returns a 0-or-positive finite number, otherwise undefined. */
export const asNonNegativeNumber = (v: unknown): number | undefined => {
    const n = asNumber(v);
    return n !== undefined && n >= 0 ? n : undefined;
};
