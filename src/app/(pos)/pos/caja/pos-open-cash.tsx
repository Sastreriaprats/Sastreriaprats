'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, DollarSign } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { useAction } from '@/hooks/use-action'
import { openCashSession } from '@/actions/pos'

export function PosOpenCash({ storeId, onOpened }: { storeId: string; onOpened: (session: any) => void }) {
  const { profile } = useAuth()
  const [openingAmount, setOpeningAmount] = useState('300')

  const { execute, isLoading } = useAction(openCashSession, {
    successMessage: 'Caja abierta',
    onSuccess: onOpened,
  })

  return (
    <div className="flex h-full items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-prats-navy/10">
            <DollarSign className="h-8 w-8 text-prats-navy" />
          </div>
          <CardTitle className="text-xl">Abrir caja</CardTitle>
          <p className="text-sm text-muted-foreground">
            Hola, {profile?.fullName}. Introduce el fondo de caja inicial.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Fondo inicial (&euro;)</Label>
            <Input
              type="number" step="0.01" min="0"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              className="text-center text-2xl h-14 font-mono"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[100, 200, 300, 500].map(amount => (
              <Button key={amount} variant="outline" size="sm"
                onClick={() => setOpeningAmount(amount.toString())}
                className={openingAmount === amount.toString() ? 'ring-2 ring-prats-navy' : ''}>
                {amount}&euro;
              </Button>
            ))}
          </div>

          <Button onClick={() => execute({ store_id: storeId, opening_amount: parseFloat(openingAmount) || 0 })}
            disabled={isLoading} className="w-full h-12 text-lg bg-prats-navy hover:bg-prats-navy-light">
            {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            Abrir caja
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
