// Joins class names, skipping the falsy ones: cx('chip', done && 'opacity-50').
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
