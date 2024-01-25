# SHYM: Self Host Your Music

WIP tool to put your music online on your own domain name.

Currently uses Cloudflare workers + r2 + d1.

todo:
* login
* rss feed
* artist profile
* album releases


## dev

```
npm install
npx wrangler d1 execute tunez-db --local --file=./schema.sql
npm run dev
```

## deploy

```
npx wrangler r2 bucket create tunez-bucket
npx wrangler d1 create tunez-db
npx wrangler d1 execute tunez-db --file=./schema.sql

npm run deploy
```
