export const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const lowerEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
