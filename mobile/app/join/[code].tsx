// https://myzauq.com/join/:code, a friend's door.
import { useLocalSearchParams } from 'expo-router'
import { LinkRedirect } from '@/src/features/links/LinkRedirect'

export default function JoinLink() {
  const { code = '' } = useLocalSearchParams<{ code: string }>()
  return <LinkRedirect path={`/join/${code}`} />
}
