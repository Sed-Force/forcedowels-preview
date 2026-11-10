// Debug endpoint to test what's failing
export default async function handler(req, res) {
  try {
    // Test 1: Basic response
    const tests = {
      step1_basic: 'OK',
      step2_env_check: {
        hasResendKey: !!process.env.RESEND_API_KEY,
        hasEmailFrom: !!process.env.EMAIL_FROM,
        resendKeyLength: process.env.RESEND_API_KEY?.length || 0,
        emailFrom: process.env.EMAIL_FROM || 'missing'
      }
    };

    // Test 2: Try importing auth
    try {
      const { json, applyCORS } = await import('./_lib/auth.js');
      tests.step3_auth_import = 'OK';
      tests.step3_auth_functions = {
        hasJson: typeof json === 'function',
        hasCORS: typeof applyCORS === 'function'
      };
    } catch (err) {
      tests.step3_auth_import = 'FAILED: ' + err.message;
    }

    // Test 3: Try importing Resend
    try {
      const { Resend } = await import('resend');
      tests.step4_resend_import = 'OK';
      const resend = new Resend(process.env.RESEND_API_KEY);
      tests.step4_resend_init = 'OK';
    } catch (err) {
      tests.step4_resend_import = 'FAILED: ' + err.message;
    }

    res.status(200).json({
      success: true,
      tests,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}

