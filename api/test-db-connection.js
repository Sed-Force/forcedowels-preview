// Test database connection
import { sql } from './_lib/db.js';

export default async function handler(req, res) {
  try {
    if (!sql) {
      return res.status(500).json({
        success: false,
        error: 'No database URL configured',
        hint: 'Set NEON_DATABASE_URL, DATABASE_URL_UNPOOLED, or DATABASE_URL in Vercel environment variables'
      });
    }

    // Test query
    const result = await sql`SELECT NOW() as current_time, version() as pg_version`;
    
    return res.status(200).json({
      success: true,
      message: 'Database connection successful!',
      data: result[0],
      env_vars: {
        has_neon_url: !!process.env.NEON_DATABASE_URL,
        has_database_url: !!process.env.DATABASE_URL,
        has_unpooled_url: !!process.env.DATABASE_URL_UNPOOLED
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      hint: 'Check that your database URL is correct and the database is accessible'
    });
  }
}

