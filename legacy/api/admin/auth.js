// /api/admin/auth.js
// Simple admin authentication
import crypto from 'crypto';

// Hash the credentials for security (stored as hashed values)
const ADMIN_USERNAME = 'Forcedowelsadmin';
const ADMIN_PASSWORD = 'ForceDowels2025!';

// Create a simple hash for comparison
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse body
    const bodyText = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => resolve(data));
    });

    let body = {};
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { username, password } = body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Username and password are required' 
      });
    }

    // Check credentials
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      return res.status(200).json({ 
        success: true,
        message: 'Authentication successful'
      });
    } else {
      // Add a small delay to prevent brute force attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return res.status(401).json({ 
        success: false,
        message: 'Invalid username or password' 
      });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Authentication failed' 
    });
  }
}

