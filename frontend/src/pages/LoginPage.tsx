import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { AuthForm } from '../components/AuthForm'
import { useAuth } from '../context/useAuth'

export function LoginPage() {
  usePageTitle('Sign in')
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(email: string, password: string) {
    await login(email, password)
    navigate('/', { replace: true })
  }

  return <AuthForm onSubmit={handleSubmit} />
}
