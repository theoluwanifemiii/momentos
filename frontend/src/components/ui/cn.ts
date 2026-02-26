type Value = string | null | undefined | false;

export function cn(...values: Value[]): string {
  return values.filter(Boolean).join(' ');
}
