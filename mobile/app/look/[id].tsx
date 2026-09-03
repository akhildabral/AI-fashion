// https://myzauq.com/look/:id, opened on the phone.
import { useLocalSearchParams } from 'expo-router'
import { LinkRedirect } from '@/src/features/links/LinkRedirect'

export default function LookLink() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  return <LinkRedirect path={`/look/${id}`} />
}
