import Link from 'next/link'
import { requirePermission } from '@/actions/auth'
import { previewCampaignEmail } from '@/actions/emails'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { PreviewClient } from './preview-client'

interface PageProps {
  params: Promise<{ campaignId: string }>
}

export const dynamic = 'force-dynamic'

export default async function CampaignPreviewPage({ params }: PageProps) {
  await requirePermission('emails.view')
  const { campaignId } = await params

  const res = await previewCampaignEmail({ campaignId })

  if (!res.success) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-6">
        <h1 className="text-2xl font-semibold">No se puede generar la vista previa</h1>
        <p className="text-sm text-muted-foreground">{res.error || 'Error desconocido'}</p>
        <Link href="/admin/emails">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Volver a campañas
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <PreviewClient
      campaignId={campaignId}
      html={res.data.html}
      subject={res.data.subject}
    />
  )
}
