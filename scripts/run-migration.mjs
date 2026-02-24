import { readFileSync } from 'fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error('Usage: node scripts/run-migration.mjs <sql-file>')
  process.exit(1)
}

const sql = readFileSync(sqlFile, 'utf8')

const projectRef = 'fvjdqazfgjspxmwlvkpg'
const password = '19Macarrones#'

const connectionOptions = [
  process.env.SUPABASE_DB_URL,
  `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-eu-west-3.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:${encodeURIComponent(password)}@${projectRef}.pooler.supabase.com:6543/postgres`,
]

async function tryConnect(connStr) {
  const client = new pg.Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  })
  await client.connect()
  return client
}

async function main() {
  let client = null

  for (const connStr of connectionOptions) {
    if (!connStr) continue
    try {
      console.log('Trying:', connStr.replace(/:[^@]*@/, ':***@').slice(0, 80) + '...')
      client = await tryConnect(connStr)
      console.log('Connected!')
      break
    } catch (e) {
      console.log('Failed:', e.message)
    }
  }

  if (!client) {
    console.error('\nCould not connect to database.')
    console.log('\n=== PLEASE RUN THIS SQL MANUALLY IN SUPABASE DASHBOARD > SQL EDITOR ===\n')
    console.log('File:', sqlFile)
    process.exit(1)
  }

  try {
    await client.query(sql)
    console.log('Migration executed successfully!')
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log('Table/object already exists - migration may have been run before.')
    } else {
      console.error('SQL Error:', e.message)
    }
  } finally {
    await client.end()
  }
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
