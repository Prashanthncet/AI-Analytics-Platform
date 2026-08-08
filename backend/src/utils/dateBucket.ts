export const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD key for the server's LOCAL timezone (what the admin perceives as "today"). */
export const dateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/** Offset string like '+05:30' / '-07:00' for $dateToString timezone. */
export const tzOffset = (): string => {
    const mins = -new Date().getTimezoneOffset();
    const sign = mins >= 0 ? '+' : '-';
    const abs = Math.abs(mins);
    const h = `${Math.floor(abs / 60)}`.padStart(2, '0');
    const m = `${abs % 60}`.padStart(2, '0');
    return `${sign}${h}:${m}`;
};

/** The `timezone` option to pass to $dateToString so buckets follow local days. */
export const MONGO_TIMEZONE = (): { timezone: string } => ({ timezone: tzOffset() });

/** Local start of the day (midnight in the server's timezone). */
export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Last `n` local date keys, oldest first (today included). DST-safe: anchored to local midnight. */
export const lastDateKeys = (n: number): string[] => {
    const out: string[] = [];
    const midnight = startOfDay(new Date()).getTime();
    for (let i = n - 1; i >= 0; i--) {
        out.push(dateKey(new Date(midnight - i * DAY_MS)));
    }
    return out;
};
