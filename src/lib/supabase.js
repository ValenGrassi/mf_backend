import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están configurados"
  )
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export const PRODUCTS_BUCKET =
  process.env.SUPABASE_PRODUCTS_BUCKET || "products"

export default supabase
