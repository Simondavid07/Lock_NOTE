import { Link } from 'react-router-dom'
import { Button, Card } from '../components/ui'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md pt-24">
      <Card className="p-6 text-center">
        <p className="font-mono text-5xl font-bold text-indigo-500">404</p>
        <h1 className="mt-3 text-lg font-semibold">Nothing sealed here</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          This page doesn&apos;t exist — and neither did the secret it might have held.
        </p>
        <div className="mt-5">
          <Link to="/">
            <Button>Go home</Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}