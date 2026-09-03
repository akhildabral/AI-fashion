// https://myzauq.com/mirror?items=a,b&lens=closet, pieces staged on the rail.
import { useLocalSearchParams } from 'expo-router'
import { LinkRedirect } from '@/src/features/links/LinkRedirect'

export default function MirrorLink() {
  const { items, lens } = useLocalSearchParams<{ items?: string; lens?: string }>()
  return <LinkRedirect path="/mirror" params={{ items, lens }} />
}
