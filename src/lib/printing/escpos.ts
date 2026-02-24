const ESC = '\x1B'
const GS = '\x1D'
const LF = '\x0A'

export class EscPosBuilder {
  private buffer: string[] = []

  initialize(): this { this.buffer.push(ESC + '@'); return this }

  alignLeft(): this { this.buffer.push(ESC + 'a' + '\x00'); return this }
  alignCenter(): this { this.buffer.push(ESC + 'a' + '\x01'); return this }
  alignRight(): this { this.buffer.push(ESC + 'a' + '\x02'); return this }

  bold(on: boolean): this { this.buffer.push(ESC + 'E' + (on ? '\x01' : '\x00')); return this }
  underline(on: boolean): this { this.buffer.push(ESC + '-' + (on ? '\x01' : '\x00')); return this }

  setSize(size: 0 | 1 | 2 | 3): this {
    const widths = [0x00, 0x10, 0x00, 0x10]
    const heights = [0x00, 0x00, 0x01, 0x01]
    this.buffer.push(GS + '!' + String.fromCharCode(widths[size] | heights[size]))
    return this
  }

  doubleWidth(): this { return this.setSize(1) }
  doubleHeight(): this { return this.setSize(2) }
  doubleSize(): this { return this.setSize(3) }
  normalSize(): this { return this.setSize(0) }

  text(text: string): this { this.buffer.push(text); return this }
  newLine(count: number = 1): this { for (let i = 0; i < count; i++) this.buffer.push(LF); return this }

  line(char: string = '-', width: number = 48): this {
    this.buffer.push(char.repeat(width) + LF)
    return this
  }

  columns(left: string, right: string, width: number = 48): this {
    const space = width - left.length - right.length
    this.buffer.push(left + ' '.repeat(Math.max(1, space)) + right + LF)
    return this
  }

  threeColumns(left: string, center: string, right: string, width: number = 48): this {
    const colWidth = Math.floor(width / 3)
    const l = left.padEnd(colWidth)
    const c = center.padStart(Math.floor(colWidth / 2) + Math.floor(center.length / 2)).padEnd(colWidth)
    const r = right.padStart(colWidth)
    this.buffer.push(l + c + r + LF)
    return this
  }

  barcode(data: string, type: 'CODE39' | 'CODE128' | 'EAN13' = 'CODE128'): this {
    this.buffer.push(GS + 'h' + String.fromCharCode(60))
    this.buffer.push(GS + 'w' + String.fromCharCode(2))
    this.buffer.push(GS + 'H' + '\x02')
    const types: Record<string, string> = { CODE39: '\x04', CODE128: '\x49', EAN13: '\x02' }
    if (type === 'CODE128') {
      this.buffer.push(GS + 'k' + types[type] + String.fromCharCode(data.length) + data)
    } else {
      this.buffer.push(GS + 'k' + types[type] + data + '\x00')
    }
    return this
  }

  qrCode(data: string, size: number = 6): this {
    this.buffer.push(GS + '(k' + '\x04\x00' + '\x31\x41\x32\x00')
    this.buffer.push(GS + '(k' + '\x03\x00' + '\x31\x43' + String.fromCharCode(size))
    this.buffer.push(GS + '(k' + '\x03\x00' + '\x31\x45\x31')
    const len = data.length + 3
    this.buffer.push(GS + '(k' + String.fromCharCode(len & 0xFF) + String.fromCharCode((len >> 8) & 0xFF) + '\x31\x50\x30' + data)
    this.buffer.push(GS + '(k' + '\x03\x00' + '\x31\x51\x30')
    return this
  }

  feed(lines: number = 3): this { this.buffer.push(ESC + 'd' + String.fromCharCode(lines)); return this }
  cut(partial: boolean = false): this { this.buffer.push(GS + 'V' + (partial ? '\x01' : '\x00')); return this }
  openDrawer(): this { this.buffer.push(ESC + 'p' + '\x00' + '\x19' + '\xFA'); return this }

  build(): string { return this.buffer.join('') }

  toUint8Array(): Uint8Array {
    const str = this.build()
    const arr = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xFF
    return arr
  }
}
