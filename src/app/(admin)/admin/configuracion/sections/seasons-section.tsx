'use client'

import { CalendarDays } from 'lucide-react'
import { TaxonomySection } from './taxonomy-section'
import {
  listSeasonsAdmin,
  createSeason,
  updateSeason,
  deleteSeason,
} from '@/actions/product-taxonomies'

export function SeasonsSection() {
  return (
    <TaxonomySection
      label="Temporada"
      labelPlural="Temporadas"
      taxonomy="season"
      icon={<CalendarDays className="h-5 w-5 text-muted-foreground" />}
      listAction={listSeasonsAdmin}
      createAction={createSeason}
      updateAction={updateSeason}
      deleteAction={deleteSeason}
    />
  )
}
