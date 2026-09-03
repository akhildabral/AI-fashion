// https://myzauq.com/trips/:id, a trip's page.
import { useLocalSearchParams } from 'expo-router'
import { LinkRedirect } from '@/src/features/links/LinkRedirect'

export default function TripLink() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  return <LinkRedirect path={`/trips/${id}`} />
}
