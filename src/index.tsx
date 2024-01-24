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
  artist_id: string
  artist_name: string
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
            <a href="/artists">artists</a>
            <a href="/tracks/new">upload</a>
            <a href="/about">about</a>
          </article>

          <div style="padding-bottom: 200px">{children}</div>
        </body>
        <script src="/static/player.js"></script>
      </html>
    )
  })
)

app.get('/about', (c) => {
  return c.render(
    <div class="container">
      <h1>trackz</h1>
      <p>Upload tracks, listen to tracks... that's about it</p>
      <p>
        <b>TODO</b>
        <br />
        <ul>
          <li>img resize in prod</li>
          <li>some client side routing</li>
          <li>more fancy client side player...</li>
          <li>playlists</li>
          <li>album releases</li>
          <li>rss feed</li>
          <li>can edit artist / track</li>
          <li>maybe some drizzle?</li>
        </ul>
      </p>
    </div>
  )
})

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `
    select
      t.*,
      a.name as artist_name
    from tracks t
    join artists a on t.artist_id = a.id
    order by created_at desc
    `
  ).all()
  const tracks = results as TrackRow[]
  return c.render(
    <div>
      <div class="tile-grid">
        {tracks.map((t) => (
          <TrackUI track={t} />
        ))}
      </div>
      <div style="position: fixed; bottom: 0px; width: 100%; padding: 20px;">
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
      <p>{track.artist_name}</p>
    </hgroup>
    {/* <div>{track.description}</div>
    <div>{new Date(track.created_at).toLocaleDateString()}</div> */}
  </article>
)

app.get('/artists/new', async (c) => {
  return c.render(
    <form class="container" action="/artists/new" method="POST" enctype="multipart/form-data">
      <h2>New Artist</h2>
      <label>
        Name
        <input type="text" name="name" required />
      </label>
      <label>
        Website
        <input type="url" name="website" />
      </label>
      <label>
        Location
        <input type="text" name="location" />
      </label>
      <label>
        Bio
        <textarea name="bio"></textarea>
      </label>
      <label>
        Image
        <input type="file" name="image" accept="image/*" required />
      </label>
      <button>Submit</button>
    </form>
  )
})

app.post('/artists/new', async (c) => {
  const id = `A${Date.now()}`
  const body = await c.req.parseBody()

  const image = body.image as File
  delete body.image

  await Promise.all([
    c.env.BUCKET.put(`img${id}`, image),
    dbInsert(c.env.DB, 'artists', {
      id,
      ...body,
    }),
  ])

  // hacky wizard stuff...
  return c.redirect('/tracks/new')
})

app.get('/artists', async (c) => {
  const { results } = await c.env.DB.prepare('select * from artists').all()
  if (c.req.query('json')) return c.json(results)
  return c.render(
    <div class="container-fluid">
      <h1>Artists</h1>
      <div class="tile-grid">
        {results.map((a) => (
          <article>
            <a href={`/artists/${a.id}`}>
              <img class="sq" src={`/upload/img${a.id}`} />
              <hgroup>
                <h2>{a.name}</h2>
                <p>{a.location}</p>
              </hgroup>
            </a>
          </article>
        ))}
      </div>
    </div>
  )
})

app.get('/artists/:id', async (c) => {
  const artist = await c.env.DB.prepare('select * from artists where id = ?').bind(c.req.param('id')).first()
  if (!artist) return c.text('not found', 404)
  if (c.req.query('json')) return c.json(artist)
  return c.render(
    <div class="container-fluid">
      <h1>{artist.name}</h1>
    </div>
  )
})

app.get('/tracks/new', async (c) => {
  const { results: artists } = await c.env.DB.prepare('select * from artists order by name').all()
  return c.render(
    <form class="container" action="/upload" method="POST" enctype="multipart/form-data">
      <article>
        <header>
          <label>Artist</label>
          <fieldset style="display: flex;">
            <select name="artist_id" required style="margin-bottom: 0px;">
              <option value="" selected>
                - Select Artist -
              </option>
              {artists.map((a) => (
                <option value={a.id as string}>{a.name}</option>
              ))}
            </select>
            <a class="secondary nowrap outline" role="button" href="/artists/new">
              + New Artist
            </a>
          </fieldset>
        </header>

        <label>
          Title
          <input type="text" name="title" placeholder="title" required />
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

app.get('/tracks/:id', async (c) => {
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
    artist_id: body.artist_id,
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
