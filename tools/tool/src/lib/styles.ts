function ansi(code: number) {
  return (s: string) => `\x1b[38;5;${code}m${s}\x1b[0m`
}

export const cyan = ansi(6)
export const gray = ansi(8)
export const green = ansi(2)
export const yellow = ansi(3)
export const red = ansi(1)
export const magenta = ansi(5)
export const pink = ansi(213)
export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
