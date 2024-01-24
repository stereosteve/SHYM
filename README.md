```
npm install
npx wrangler d1 execute tunez-db --local --file=./schema.sql
npm run dev
```



```
npx wrangler r2 bucket create tunez-bucket
npx wrangler d1 create tunez-db
npx wrangler d1 execute tunez-db --file=./schema.sql

npm run deploy
```
