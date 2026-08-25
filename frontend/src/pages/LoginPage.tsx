import { useNavigate } from 'react-router-dom'
import { AuthForm } from '../components/AuthForm'
import { useAuth } from '../context/useAuth'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(email: string, password: string) {
    await login(email, password)
    navigate('/', { replace: true })
  }

  return <AuthForm mode="login" onSubmit={handleSubmit} />
}
