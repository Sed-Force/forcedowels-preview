// Test endpoint to check if environment variables are loaded
export default function handler(req, res) {
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;
  const hasDatabase = !!process.env.DATABASE_URL;
  
  res.status(200).json({
    stripe_configured: hasStripe,
    stripe_key_prefix: hasStripe ? process.env.STRIPE_SECRET_KEY.substring(0, 7) : 'missing',
    database_configured: hasDatabase,
    env_file_loaded: hasStripe && hasDatabase
  });
}

