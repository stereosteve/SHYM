import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import type { R2Bucket, D1Database } from '@cloudflare/workers-types'
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from './schema'
import { eq } from 'drizzle-orm'

type Bindings = {
  BUCKET: R2Bucket
  DB: D1Database
  DRIZZ: DrizzleD1Database<typeof schema>
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', (c, next) => {
  c.env.DRIZZ = drizzle(c.env.DB, { schema })
  return next()
})

app.get('/static/*', serveStatic({ root: './' }))

app.get(
  '*',
  jsxRenderer(({ children }) => {
    return (
      <html lang="en" data-theme="dark">
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
  const tracks = await c.env.DRIZZ.query.tracks.findMany({
    with: {
      artist: true,
    },
  })

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

app.get('/demo', async (c) => {
  const db = c.env.DRIZZ
  const ok = await db.query.tracks.findMany({
    with: {
      artist: true,
    },
  })
  return c.json(ok)
})

app.get('/demo2', async (c) => {
  const ok = await c.env.DRIZZ.query.artists.findMany({
    with: {
      tracks: true,
    },
  })
  return c.json(ok)
})

const TrackUI = ({ track }: { track: schema.TracksWithArtist }) => (
  <article id={track.id} class="track" onClick={`play('${track.id}')`} style="padding: 20px; margin: 0px;">
    <img class="sq" src={`/upload/img${track.id}`} />
    <hgroup>
      <h3>{track.title}</h3>
      <p>{track.artist.name}</p>
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
    c.env.DRIZZ.insert(schema.artists).values({
      id,
      ...(body as any), // todo: zod
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
  const artist = await c.env.DRIZZ.query.artists.findFirst({
    where: eq(schema.artists.id, c.req.param('id')),
    with: {
      tracks: true,
    },
  })
  if (!artist) return c.text('not found', 404)
  if (c.req.query('json')) return c.json(artist)
  return c.render(
    <div class="container-fluid">
      <h1>{artist.name}</h1>
      {artist.tracks.map((t) => (
        <TrackUI track={{ ...t, artist }} />
      ))}
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
  const track = await c.env.DRIZZ.query.tracks.findFirst({
    where: eq(schema.tracks.id, id),
    with: {
      artist: true,
    },
  })
  if (!track) return c.text('not found', 404)
  // return c.json(track)
  return c.render(<TrackUI track={track} />)
})

app.post('/upload', async (c, next) => {
  const id = `_${Date.now()}`
  const body = await c.req.parseBody()
  const song = body['song'] as File
  const image = body['image'] as File

  // todo: some zod validator
  const trackData = body as Record<string, string>

  await Promise.all([
    c.env.BUCKET.put(`song${id}`, song),
    c.env.BUCKET.put(`img${id}`, image),
    c.env.DRIZZ.insert(schema.tracks).values({
      id: id,
      title: trackData.title,
      artistId: trackData.artist_id,
      description: trackData.description,
    }),
  ])

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

export default app
