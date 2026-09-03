// https://myzauq.com/closet/piece/:id, a piece's dossier.
import { useLocalSearchParams } from 'expo-router'
import { LinkRedirect } from '@/src/features/links/LinkRedirect'

export default function PieceLink() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  return <LinkRedirect path={`/closet/piece/${id}`} />
}
