// Check orders table schema
import { sql } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    // Query to get column information from the orders table
    const columns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'orders'
      ORDER BY ordinal_position
    `;

    return res.status(200).json({
      success: true,
      columns: columns.map(col => ({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable,
        default: col.column_default
      }))
    });

  } catch (err) {
    console.error('Error checking schema:', err);
    return res.status(500).json({
      error: 'Failed to check schema',
      message: err.message
    });
  }
}
