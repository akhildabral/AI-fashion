// https://myzauq.com/vote/:id, opened on the phone: the verdict, in the app.
import { useLocalSearchParams } from 'expo-router'
import { LinkRedirect } from '@/src/features/links/LinkRedirect'

export default function VoteLink() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  return <LinkRedirect path={`/vote/${id}`} />
}
