export type PrinterConnection = 'serial' | 'usb' | 'bluetooth' | 'network' | 'browser'

export interface PrinterConfig {
  type: PrinterConnection
  name: string
  baudRate?: number
  ip?: string
  port?: number
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class PrintService {
  private serialPort: any = null
  private usbDevice: any = null

  async connectSerial(baudRate: number = 9600): Promise<boolean> {
    if (!('serial' in navigator)) return false
    try {
      this.serialPort = await (navigator as any).serial.requestPort()
      await this.serialPort.open({ baudRate })
      return true
    } catch {
      return false
    }
  }

  async printSerial(data: Uint8Array): Promise<boolean> {
    if (!this.serialPort?.writable) return false
    try {
      const writer = this.serialPort.writable.getWriter()
      await writer.write(data)
      writer.releaseLock()
      return true
    } catch {
      return false
    }
  }

  async disconnectSerial(): Promise<void> {
    if (this.serialPort) {
      await this.serialPort.close()
      this.serialPort = null
    }
  }

  async connectUSB(): Promise<boolean> {
    if (!('usb' in navigator)) return false
    try {
      this.usbDevice = await (navigator as any).usb.requestDevice({
        filters: [
          { vendorId: 0x04B8 },
          { vendorId: 0x0519 },
          { vendorId: 0x1504 },
        ],
      })
      await this.usbDevice.open()
      await this.usbDevice.selectConfiguration(1)
      await this.usbDevice.claimInterface(0)
      return true
    } catch {
      return false
    }
  }

  async printUSB(data: Uint8Array): Promise<boolean> {
    if (!this.usbDevice?.configuration) return false
    try {
      const iface = this.usbDevice.configuration.interfaces[0]
      const endpoint = iface.alternate.endpoints.find((e: any) => e.direction === 'out')
      if (!endpoint) return false
      await this.usbDevice.transferOut(endpoint.endpointNumber, data)
      return true
    } catch {
      return false
    }
  }

  printBrowser(ticketHtml: string): void {
    const win = window.open('', '_blank', 'width=300,height=600')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; margin: 0; padding: 8mm; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .big { font-size: 18px; }
        .line { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; }
        @media print { body { margin: 0; padding: 4mm; } }
      </style></head><body>${ticketHtml}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  async print(data: Uint8Array, config: PrinterConfig): Promise<boolean> {
    switch (config.type) {
      case 'serial':
        if (!this.serialPort) await this.connectSerial(config.baudRate)
        return this.printSerial(data)
      case 'usb':
        if (!this.usbDevice) await this.connectUSB()
        return this.printUSB(data)
      case 'network':
        return this.printNetwork(data, config.ip!, config.port || 9100)
      default:
        return false
    }
  }

  async printNetwork(data: Uint8Array, ip: string, port: number): Promise<boolean> {
    try {
      const res = await fetch('/api/print/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port, data: Array.from(data) }),
      })
      return res.ok
    } catch { return false }
  }
}

export const printService = new PrintService()
