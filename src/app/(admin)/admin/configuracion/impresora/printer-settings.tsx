'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Printer, Usb, Wifi, Monitor, CheckCircle, XCircle, TestTube } from 'lucide-react'
import { EscPosBuilder } from '@/lib/printing/escpos'
import { printService, type PrinterConnection } from '@/lib/printing/print-service'
import { toast } from 'sonner'

const connectionIcons: Record<string, typeof Monitor> = {
  browser: Monitor,
  usb: Usb,
  serial: Printer,
  network: Wifi,
}

export function PrinterSettings() {
  const [config, setConfig] = useState<{
    type: PrinterConnection; name: string; baudRate: number; ip: string; port: number
  }>({
    type: 'browser', name: 'Impresora TPV', baudRate: 9600, ip: '', port: 9100,
  })
  const [isConnected, setIsConnected] = useState(false)
  const [isTesting, setIsTesting] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('prats_printer_config')
    if (saved) {
      try { setConfig(JSON.parse(saved)) } catch { /* ignore */ }
    }
  }, [])

  const saveConfig = () => {
    localStorage.setItem('prats_printer_config', JSON.stringify(config))
    toast.success('Configuración guardada')
  }

  const testPrint = async () => {
    setIsTesting(true)
    try {
      const b = new EscPosBuilder()
      b.initialize()
        .alignCenter().doubleSize().text('PRATS').newLine()
        .normalSize().text('TEST DE IMPRESIÓN').newLine(2)
        .alignLeft()
        .text(`Fecha: ${new Date().toLocaleString('es-ES')}`).newLine()
        .text(`Impresora: ${config.name}`).newLine()
        .text(`Conexión: ${config.type}`).newLine()
        .line('=')
        .alignCenter().text('Impresión correcta').newLine(2)
        .feed(3).cut()

      if (config.type === 'browser') {
        printService.printBrowser(`
          <div class="center bold big" style="letter-spacing:6px;">PRATS</div>
          <div class="center">TEST DE IMPRESIÓN</div><br>
          <div>Fecha: ${new Date().toLocaleString('es-ES')}</div>
          <div>Impresora: ${config.name}</div>
          <div class="line"></div>
          <div class="center bold">Impresión correcta</div>
        `)
        toast.success('Test enviado al navegador')
      } else {
        const ok = await printService.print(b.toUint8Array(), config)
        if (ok) {
          toast.success('Test impreso correctamente')
          setIsConnected(true)
        } else {
          toast.error('Error en test de impresión')
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error'
      toast.error(msg)
    }
    setIsTesting(false)
  }

  const connectPrinter = async () => {
    try {
      let result = false
      if (config.type === 'serial') result = await printService.connectSerial(config.baudRate)
      else if (config.type === 'usb') result = await printService.connectUSB()
      setIsConnected(result)
      if (result) toast.success('Impresora conectada')
      else toast.error('No se pudo conectar')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error de conexión'
      toast.error(msg)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración de impresora</h1>
        <p className="text-muted-foreground">Configura la impresora de tickets y etiquetas</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Tipo de conexión</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {([
                { type: 'browser' as const, label: 'Navegador', desc: 'Imprimir vía ventana del navegador' },
                { type: 'usb' as const, label: 'USB', desc: 'Conexión directa Web USB' },
                { type: 'serial' as const, label: 'Serial', desc: 'Puerto serie / COM' },
                { type: 'network' as const, label: 'Red', desc: 'IP de red (TCP/IP)' },
              ]).map(p => {
                const Icon = connectionIcons[p.type]
                return (
                  <button
                    key={p.type}
                    onClick={() => setConfig(c => ({ ...c, type: p.type }))}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      config.type === p.type
                        ? 'border-prats-navy bg-prats-navy/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-5 w-5 text-prats-navy mb-2" />
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Ajustes
              <Badge variant={isConnected ? 'default' : 'secondary'} className="gap-1">
                {isConnected ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {isConnected ? 'Conectada' : 'Desconectada'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={config.name} onChange={e => setConfig(c => ({ ...c, name: e.target.value }))} />
            </div>

            {config.type === 'serial' && (
              <div className="space-y-2">
                <Label>Baud Rate</Label>
                <Select
                  value={config.baudRate.toString()}
                  onValueChange={v => setConfig(c => ({ ...c, baudRate: parseInt(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[9600, 19200, 38400, 57600, 115200].map(r => (
                      <SelectItem key={r} value={r.toString()}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {config.type === 'network' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IP</Label>
                  <Input
                    value={config.ip}
                    onChange={e => setConfig(c => ({ ...c, ip: e.target.value }))}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Puerto</Label>
                  <Input
                    type="number"
                    value={config.port}
                    onChange={e => setConfig(c => ({ ...c, port: parseInt(e.target.value) || 9100 }))}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={saveConfig} className="bg-prats-navy hover:bg-prats-navy/90">Guardar</Button>
              {config.type !== 'browser' && (
                <Button variant="outline" onClick={connectPrinter}>Conectar</Button>
              )}
              <Button variant="outline" className="gap-1" onClick={testPrint} disabled={isTesting}>
                <TestTube className="h-3 w-3" />{isTesting ? 'Imprimiendo...' : 'Test'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
