import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'

import type { R2Bucket, KVNamespace, D1Database } from '@cloudflare/workers-types'

type Bindings = {
  BUCKET: R2Bucket
  DB: D1Database
}

type TrackRow = {
  id: string
  title: string
  artist: string
  description: string
  created_at: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/static/*', serveStatic({ root: './' }))

app.get(
  '*',
  jsxRenderer(({ children }) => {
    return (
      <html>
        <head>
          <title>tunez</title>
          <link rel="stylesheet" href="/static/look.css" />
        </head>
        <body>
          <header>
            <a href="/">tunez</a>
          </header>
          <div>{children}</div>
        </body>
      </html>
    )
  })
)

app.get('/page/about', (c) => {
  return c.render(<h1>About me!</h1>)
})

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('select * from tracks order by created_at desc').all()
  const tracks = results as TrackRow[]
  return c.render(
    <div>
      {tracks.map((t) => (
        <TrackUI track={t} />
      ))}
      <form action="/upload" method="POST" enctype="multipart/form-data">
        <input type="text" name="title" placeholder="title" required />
        <input type="text" name="artist" placeholder="artist" required />
        <textarea name="description"></textarea>
        <input type="file" name="file" required />
        <button> submit </button>
      </form>
    </div>
  )
})

const TrackUI = ({ track }: { track: TrackRow }) => (
  <div class="track">
    <div style={{ fontSize: 44 }}>
      <a href={`/track/${track.id}`}>{track.title}</a>
    </div>
    <div>{track.artist}</div>
    <div>{track.description}</div>
    <div>{new Date(track.created_at).toLocaleDateString()}</div>
    <div>
      <audio src={`/upload/${track.id}`} controls />
    </div>
  </div>
)

app.get('/track/:id', async (c) => {
  const id = c.req.param('id')
  const track = await c.env.DB.prepare('select * from tracks where id = ?').bind(id).first()
  if (!track) return c.text('not found', 404)
  // return c.json(track)
  return c.render(<TrackUI track={track as TrackRow} />)
})

app.post('/upload', async (c, next) => {
  const key = `track${Date.now()}`
  const body = await c.req.parseBody()
  const file = body['file'] as File
  await c.env.BUCKET.put(key, file)

  await dbInsert(c.env.DB, 'tracks', {
    id: key,
    title: body.title,
    artist: body.artist,
    description: body.description,
  })

  return c.redirect('/')
})

app.get('/upload/:key', async (c, next) => {
  const key = c.req.param('key')
  const object = await c.env.BUCKET.get(key)
  if (!object) return c.notFound()
  const data = await object.arrayBuffer()
  const contentType = object.httpMetadata?.contentType ?? ''
  const maxAge = 60 * 60 * 24 * 30

  return c.body(data, 200, {
    'Cache-Control': `public, max-age=${maxAge}`,
    'Content-Type': contentType,
  })
})

async function dbInsert(db: D1Database, table: string, data: Record<string, any>) {
  const fields = Object.keys(data).join(',')
  const qs = Object.keys(data)
    .map((f) => '?')
    .join(',')
  const stmt = `insert into ${table} (${fields}) values (${qs})`
  return db
    .prepare(stmt)
    .bind(...Object.values(data))
    .all()
}

export default app
