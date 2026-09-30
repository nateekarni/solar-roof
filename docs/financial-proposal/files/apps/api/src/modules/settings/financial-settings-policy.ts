export function parsePaymentTermDays(value: unknown): number | null {
 if (value === null || value === undefined) return null;
 if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 3650) throw new Error('Payment term must be an explicit non-negative whole number of calendar days');
 return value;
}
export function assertSampleSeedAllowed(environment: string | undefined, optIn: string | undefined): void {
 if (!['development', 'test'].includes(environment ?? '') || optIn !== 'yes') throw new Error('Sample financial seed requires NODE_ENV=development or test and FINANCIAL_SAMPLE_SEED=yes');
}
export function validateReminderSchedule(enabled: unknown, days: unknown): asserts days is number[] {
 if (typeof enabled !== 'boolean' || !Array.isArray(days) || days.some(d => typeof d !== 'number' || !Number.isSafeInteger(d) || d <= 0) || new Set(days).size !== days.length || (enabled && days.length === 0)) throw new Error('Provide distinct positive calendar-day offsets before enabling reminders');
}
