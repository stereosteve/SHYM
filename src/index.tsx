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
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="stylesheet" href="/static/pico.css" />
          <link rel="stylesheet" href="/static/pico_ext.css" />
          <title>tunez</title>
        </head>
        <body>
          <article style="margin-top: 0; padding: 20px; display: flex; gap: 20px;">
            <a href="/">tunez</a>
            <a href="/track/new">upload</a>
          </article>

          <div style="padding-bottom: 200px">{children}</div>
        </body>
        <script src="/static/player.js"></script>
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
      <div style="display: flex; flex-wrap: wrap; gap: 40px; justify-content: center">
        {tracks.map((t) => (
          <TrackUI track={t} />
        ))}
      </div>
      <div style="position: fixed; bottom: 0px; width: 100%; padding: 20px; margin: 0;">
        <audio style="width: 100%" id="player" controls />
      </div>
    </div>
  )
})

const TrackUI = ({ track }: { track: TrackRow }) => (
  <article id={track.id} class="track" onClick={`play('${track.id}')`} style="padding: 20px; margin: 0px;">
    <img class="sq" src={`/upload/img${track.id}`} />
    <hgroup>
      <h3>{track.title}</h3>
      <p>{track.artist}</p>
    </hgroup>
    {/* <div>{track.description}</div>
    <div>{new Date(track.created_at).toLocaleDateString()}</div> */}
  </article>
)

app.get('/track/new', (c) => {
  return c.render(
    <form class="container" action="/upload" method="POST" enctype="multipart/form-data">
      <article>
        <header>Upload Track</header>

        <label>
          Title
          <input type="text" name="title" placeholder="title" required />
        </label>

        <label>
          Artist
          <input type="text" name="artist" placeholder="artist" required />
        </label>

        <label>
          Description <br />
          <small class="secondary">Describe process, instruments, tools, techniques</small>
          <textarea name="description"></textarea>
        </label>

        <div class="grid">
          <label>
            Audio
            <input type="file" name="song" accept="audio/*" required />
          </label>
          <label>
            Image
            <input type="file" name="image" accept="image/*" required />
          </label>
        </div>

        <footer>
          <button> submit </button>
        </footer>
      </article>
    </form>
  )
})

app.get('/track/:id', async (c) => {
  const id = c.req.param('id')
  const track = await c.env.DB.prepare('select * from tracks where id = ?').bind(id).first()
  if (!track) return c.text('not found', 404)
  // return c.json(track)
  return c.render(<TrackUI track={track as TrackRow} />)
})

app.post('/upload', async (c, next) => {
  const id = `_${Date.now()}`
  const body = await c.req.parseBody()
  const song = body['song'] as File
  const image = body['image'] as File
  await c.env.BUCKET.put(`song${id}`, song)
  await c.env.BUCKET.put(`img${id}`, image)

  await dbInsert(c.env.DB, 'tracks', {
    id: id,
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
